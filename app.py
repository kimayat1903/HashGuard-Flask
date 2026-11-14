import hashlib
import os
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from pymongo import MongoClient
from pymongo.errors import PyMongoError

load_dotenv()

app = Flask(__name__, static_folder="public", static_url_path="/public")
app.config["MAX_CONTENT_LENGTH"] = 4 * 1024 * 1024  # Keep below Vercel's request limit

MAX_FILE_BYTES = 4 * 1024 * 1024
_mongo_client = None
_references = None


def get_references_collection():
    """Connect lazily so the app can start even before the DB is configured."""
    global _mongo_client, _references
    if _references is not None:
        return _references

    mongo_uri = os.environ.get("MONGO_URI", "").strip()
    if not mongo_uri:
        raise RuntimeError("MongoDB is not configured. Add MONGO_URI to your environment.")

    _mongo_client = MongoClient(
        mongo_uri,
        serverSelectionTimeoutMS=8000,
        connectTimeoutMS=8000,
    )
    # Verify connectivity and select the HashGuard database/collection.
    _mongo_client.admin.command("ping")
    _references = _mongo_client["hashguard"]["file_references"]
    _references.create_index("record_id", unique=True)
    return _references


def calculate_sha256(file_storage):
    """Calculate SHA-256 using Python hashlib and chunked file reads."""
    digest = hashlib.sha256()
    while True:
        chunk = file_storage.stream.read(1024 * 1024)
        if not chunk:
            break
        digest.update(chunk)
    file_storage.stream.seek(0)
    return digest.hexdigest()


def save_reference(file_name, digest):
    collection = get_references_collection()
    record_id = str(uuid.uuid4())
    document = {
        "record_id": record_id,
        "file_name": file_name[:255],
        "sha256": digest,
        "created_at": datetime.now(timezone.utc),
    }
    collection.insert_one(document)
    return record_id


def get_reference(record_id):
    collection = get_references_collection()
    return collection.find_one(
        {"record_id": record_id},
        {"_id": 0, "record_id": 1, "file_name": 1, "sha256": 1, "created_at": 1},
    )


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/health")
def health():
    return jsonify({"status": "ok", "app": "HashGuard"})


@app.post("/api/register")
def register():
    uploaded = request.files.get("file")
    if not uploaded or not uploaded.filename:
        return jsonify({"error": "Choose a file first."}), 400

    digest = calculate_sha256(uploaded)
    try:
        record_id = save_reference(uploaded.filename, digest)
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503
    except PyMongoError:
        app.logger.exception("MongoDB registration failed")
        return jsonify({"error": "Could not save the reference in MongoDB. Check the database connection."}), 503

    return jsonify({
        "status": "registered",
        "record_id": record_id,
        "file_name": uploaded.filename,
        "sha256": digest,
    })


@app.post("/api/verify")
def verify():
    uploaded = request.files.get("file")
    record_id = (request.form.get("record_id") or "").strip()

    if not uploaded or not uploaded.filename:
        return jsonify({"error": "Choose the file you want to verify."}), 400
    if not record_id:
        return jsonify({"error": "Enter the reference ID from registration."}), 400

    current_digest = calculate_sha256(uploaded)
    try:
        reference = get_reference(record_id)
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503
    except PyMongoError:
        app.logger.exception("MongoDB verification lookup failed")
        return jsonify({"error": "Could not retrieve the reference from MongoDB. Check the database connection."}), 503

    if not reference:
        return jsonify({"error": "No registered reference was found for that ID."}), 404

    matches = current_digest == reference["sha256"]
    return jsonify({
        "status": "match" if matches else "mismatch",
        "file_name": uploaded.filename,
        "reference_file_name": reference["file_name"],
        "current_sha256": current_digest,
        "registered_sha256": reference["sha256"],
        "record_id": record_id,
    })


@app.errorhandler(413)
def too_large(_error):
    return jsonify({"error": "File is too large. This demo accepts files up to 4 MB."}), 413


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
