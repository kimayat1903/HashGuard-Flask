const tabs = document.querySelectorAll(".tab");
const panels = document.querySelectorAll(".panel");

tabs.forEach(tab => tab.addEventListener("click", () => {
  tabs.forEach(item => { item.classList.remove("active"); item.setAttribute("aria-selected", "false"); });
  panels.forEach(panel => panel.classList.remove("active"));
  tab.classList.add("active");
  tab.setAttribute("aria-selected", "true");
  document.getElementById(tab.dataset.panel).classList.add("active");
}));

function setupFileInput(inputId, selectedId, dropId) {
  const input = document.getElementById(inputId);
  const selected = document.getElementById(selectedId);
  const drop = document.getElementById(dropId);
  input.addEventListener("change", () => {
    const file = input.files[0];
    selected.textContent = file ? `${file.name} · ${formatBytes(file.size)}` : "No file selected";
  });
  ["dragenter", "dragover"].forEach(eventName => drop.addEventListener(eventName, e => {
    e.preventDefault(); drop.classList.add("dragover");
  }));
  ["dragleave", "drop"].forEach(eventName => drop.addEventListener(eventName, e => {
    e.preventDefault(); drop.classList.remove("dragover");
  }));
  drop.addEventListener("drop", e => {
    if (e.dataTransfer.files.length) {
      input.files = e.dataTransfer.files;
      input.dispatchEvent(new Event("change"));
    }
  });
}
setupFileInput("register-file", "register-selected", "register-dropzone");
setupFileInput("verify-file", "verify-selected", "verify-dropzone");

function formatBytes(bytes) {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}
function showResult(element, title, message, type = "", hashes = []) {
  element.className = `result ${type}`;
  element.innerHTML = "";
  const heading = document.createElement("div");
  heading.className = "result-title";
  const icon = document.createElement("span");
  icon.className = "result-icon";
  icon.textContent = type === "error" || type === "mismatch" ? "!" : "✓";
  const titleText = document.createElement("span");
  titleText.textContent = title;
  heading.append(icon, titleText);
  element.append(heading);
  const paragraph = document.createElement("p");
  paragraph.textContent = message;
  element.append(paragraph);
  hashes.forEach(item => {
    const label = document.createElement("div");
    label.className = "hash-label";
    label.textContent = item.label;
    const value = document.createElement("div");
    value.className = "hash-value";
    value.textContent = item.value;
    element.append(label, value);
  });
}
async function submitFile(form, endpoint, resultId, buttonText) {
  const result = document.getElementById(resultId);
  const button = form.querySelector("button[type=submit]");
  const original = button.innerHTML;
  button.disabled = true;
  button.textContent = "Processing...";
  result.className = "result hidden";
  try {
    const response = await fetch(endpoint, { method: "POST", body: new FormData(form) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Something went wrong.");
    if (endpoint.endsWith("register")) {
      showResult(result, "Reference registered", "Save this reference ID. You will need it when verifying this file.", "", [
        {label: "REFERENCE ID", value: data.record_id},
        {label: "SHA-256 FINGERPRINT", value: data.sha256}
      ]);
      const copy = document.createElement("button");
      copy.className = "copy-button";
      copy.textContent = "Copy reference ID";
      copy.addEventListener("click", async () => {
        await navigator.clipboard.writeText(data.record_id);
        copy.textContent = "Copied!";
      });
      result.append(copy);
    } else {
      const matched = data.status === "match";
      showResult(result, matched ? "MATCH — file is unchanged" : "MISMATCH — file has changed",
        matched ? "The calculated SHA-256 fingerprint matches the registered reference." : "The calculated SHA-256 fingerprint differs from the registered reference.",
        matched ? "" : "mismatch", [
          {label: "CURRENT SHA-256", value: data.current_sha256},
          {label: "REGISTERED SHA-256", value: data.registered_sha256}
        ]);
    }
  } catch (error) {
    showResult(result, "Unable to complete request", error.message, "error");
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}
document.getElementById("register-form").addEventListener("submit", event => {
  event.preventDefault();
  if (!document.getElementById("register-file").files.length) return;
  submitFile(event.currentTarget, "/api/register", "register-result", "Register");
});
document.getElementById("verify-form").addEventListener("submit", event => {
  event.preventDefault();
  if (!document.getElementById("verify-file").files.length) return;
  submitFile(event.currentTarget, "/api/verify", "verify-result", "Verify");
});
