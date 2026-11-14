# HashGuard

HashGuard calculates SHA-256 using Python's `hashlib`, saves reference metadata and digests in MongoDB Atlas, and verifies a later file against a saved reference.

## Local setup (Windows Command Prompt)

```cmd
python -m venv venv
venv\Scripts\activate.bat
python -m pip install -r requirements.txt
```

Create a `.env` file in the same folder as `app.py` and add:

```env
MONGO_URI=mongodb+srv://USERNAME:PASSWORD@YOUR-CLUSTER.mongodb.net/?retryWrites=true&w=majority
```

Replace the example with your Atlas connection string. URL-encode special characters in the password. Never commit `.env` to GitHub.

Run:

```cmd
python app.py
```

Open http://127.0.0.1:5000

## MongoDB Atlas setup

1. Create an Atlas cluster and a database user with read/write access.
2. In Network Access, add the IP address of the computer used for local testing.
3. Copy the Python / PyMongo connection string and place it in `.env` as `MONGO_URI`.
4. The app creates the `hashguard` database and `file_references` collection automatically on first registration.

For Vercel deployment, configure `MONGO_URI` in Project Settings → Environment Variables. Atlas Network Access must also permit connections from the deployed app. Do not expose database credentials.

## File-size note

The demo accepts files up to 4 MB, intentionally below Vercel's 4.5 MB Function request/response body limit.

## Limitations

This educational demo has no user accounts or ownership controls. Anyone with a reference UUID can verify against that record. Only file name, SHA-256 digest, reference UUID and timestamp are stored; uploaded file contents are not retained.
