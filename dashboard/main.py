import json
import os
import re
import shutil
import uuid
from datetime import datetime

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # my_apps/
# Static site published on GitHub Pages => docs/ folder (deployed by GitHub Pages).
WEB_DIR = os.path.join(BASE_DIR, "docs")
FILES_DIR = os.path.join(WEB_DIR, "static", "files")
APPS_DIR = os.path.join(FILES_DIR, "apps")
INDEX_OUTPUT = os.path.join(WEB_DIR, "static", "apps-index.js")

# Accepted package extensions for upload (APK, EXE, etc.)
PACKAGE_EXTS = {
    "apk", "exe", "msi", "appx", "appxbundle", "aab",
    "deb", "rpm", "zip", "tar", "gz", "7z", "rar",
    "ipa", "dmg", "pkg", "snap", "flatpak", "AppImage",
}
SCREENSHOT_EXTS = {"png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"}

# Predefined target OS for the dashboard select
OS_TARGETS = [
    "Android",
    "iOS",
    "Windows",
    "macOS",
    "Linux",
    "Web",
    "Other",
]

app = FastAPI(title="My Apps Store - Upload", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def safe_slug(text: str) -> str:
    """Turns a name into a safe folder id."""
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug or "app"


def app_dir(app_id: str) -> str:
    """Validates an app_id (app folder under static/files/apps) and returns its path."""
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,120}", app_id or ""):
        raise HTTPException(status_code=400, detail="Invalid application id")
    directory = os.path.join(APPS_DIR, app_id)
    if not os.path.isdir(directory):
        raise HTTPException(status_code=404, detail="Application not found")
    return directory


def data_path(directory: str) -> str:
    return os.path.join(directory, "app.json")


def read_data(directory: str) -> dict:
    """Lit l'index d'une app (metadata JSON généré côté serveur)."""
    path = data_path(directory)
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def write_data(directory: str, data: dict) -> None:
    with open(data_path(directory), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def read_apps() -> list:
    """Liste toutes les apps (dossiers sous static/files/apps) avec leurs données."""
    apps = []
    if os.path.isdir(APPS_DIR):
        for entry in sorted(os.listdir(APPS_DIR), reverse=True):
            directory = os.path.join(APPS_DIR, entry)
            if not os.path.isdir(directory):
                continue
            data = read_data(directory)
            if not data:
                continue
            apps.append(data)
    return apps


def write_apps_index() -> None:
    """Regenerates static/apps-index.js readable by the static site."""
    apps = read_apps()
    js = "window.APPS_INDEX = " + json.dumps({"apps": apps, "generated": datetime.now().isoformat()}, ensure_ascii=False, indent=2) + ";\n"
    with open(INDEX_OUTPUT, "w", encoding="utf-8") as f:
        f.write(js)


def unique_filename(filename: str, directory: str, prefix: str) -> str:
    """Generates a unique timestamped + uuid filename."""
    original = filename or ""
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", os.path.splitext(original)[0])
    if not stem:
        stem = "file"
    ext = os.path.splitext(original)[1].lower()
    name = f"{datetime.now():%Y%m%d%H%M%S}_{uuid.uuid4().hex[:6]}_{prefix}_{stem}{ext}"
    # Avoid any collision
    while os.path.exists(os.path.join(directory, name)):
        name = f"{datetime.now():%Y%m%d%H%M%S}_{uuid.uuid4().hex[:8]}_{prefix}_{stem}{ext}"
    return name


def write_upload(file: UploadFile, directory: str, prefix: str) -> str:
    """Writes an uploaded file into directory and returns its name."""
    content = file.file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    name = unique_filename(file.filename or "fichier", directory, prefix)
    with open(os.path.join(directory, name), "wb") as f:
        f.write(content)
    return name


@app.get("/api/apps")
def list_apps():
    """Returns all apps for the dashboard."""
    apps = read_apps()
    return {"ok": True, "apps": apps}


@app.post("/api/apps/upload")
async def upload_app(
    name: str = Form(...),
    description: str = Form(...),
    os_target: str = Form(...),
    version: str = Form(""),
    developer: str = Form(""),
    package: UploadFile = File(...),
    icon: UploadFile = File(default=None),
    screenshots: list[UploadFile] = File(default=[]),
):
    """Creates an app: package (apk/exe/...) + metadata + icon + screenshots."""
    name = name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="App name is required")
    os_target = os_target.strip() or "Other"
    if os_target not in OS_TARGETS:
        os_target = "Other"

    if package.filename is None:
        raise HTTPException(status_code=400, detail="Package file is missing")
    ext = os.path.splitext(package.filename)[1].lower().lstrip(".")
    if ext not in PACKAGE_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported package extension: .{ext}. "
                   f"Allowed: {', '.join(sorted(PACKAGE_EXTS))}",
        )

    # The app folder is based on a unique slug of the name.
    base = safe_slug(name)
    app_id = base
    i = 1
    while os.path.exists(os.path.join(APPS_DIR, app_id)):
        i += 1
        app_id = f"{base}-{i}"

    directory = os.path.join(APPS_DIR, app_id)
    os.makedirs(directory, exist_ok=True)

    package_file = write_upload(package, directory, "pkg")
    package_path = os.path.join(directory, package_file)

    icon_file = None
    if icon is not None and icon.filename:
        iext = os.path.splitext(icon.filename)[1].lower().lstrip(".")
        if iext in SCREENSHOT_EXTS:
            icon_file = write_upload(icon, directory, "icon")

    screenshots_names = []
    for i, shot in enumerate(screenshots):
        if shot.filename is None:
            continue
        sext = os.path.splitext(shot.filename)[1].lower().lstrip(".")
        if sext not in SCREENSHOT_EXTS:
            continue
        sname = write_upload(shot, directory, f"shot{i + 1}")
        screenshots_names.append(sname)

    data = {
        "id": app_id,
        "name": name,
        "description": description.strip(),
        "os_target": os_target,
        "os_label": os_target,
        "version": version.strip(),
        "developer": developer.strip(),
        "size": os.path.getsize(package_path),
        "package": package_file,
        "package_url": f"/static/files/apps/{app_id}/{package_file}",
        "icon": icon_file,
        "icon_url": f"/static/files/apps/{app_id}/{icon_file}" if icon_file else None,
        "screenshots": [f"/static/files/apps/{app_id}/{s}" for s in screenshots_names],
        "screenshots_names": screenshots_names,
        "created": datetime.now().isoformat(),
        "modified": datetime.fromtimestamp(os.path.getmtime(package_path)).isoformat(),
    }
    write_data(directory, data)
    write_apps_index()
    return {"ok": True, "app": data}


@app.post("/api/apps/{app_id}/delete")
async def delete_app(app_id: str):
    """Deletes an app completely (folder + index)."""
    directory = app_dir(app_id)
    shutil.rmtree(directory)
    write_apps_index()
    return {"ok": True}


@app.post("/api/apps/{app_id}/update")
async def update_app(
    app_id: str,
    name: str = Form(...),
    description: str = Form(...),
    os_target: str = Form(...),
    version: str = Form(""),
    developer: str = Form(""),
    icon: UploadFile = File(default=None),
    screenshots: list[UploadFile] = File(default=[]),
    remove_icon: str = Form("false"),
):
    """Updates an app's metadata, optionally replacing the icon and adding screenshots."""
    name = name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="App name is required")
    os_target = os_target.strip() or "Other"
    if os_target not in OS_TARGETS:
        os_target = "Other"

    directory = app_dir(app_id)
    data = read_data(directory)
    if not data:
        raise HTTPException(status_code=404, detail="Application data missing")

    if remove_icon.lower() == "true" or remove_icon == "1":
        data["icon"] = None
        data["icon_url"] = None
    if icon is not None and icon.filename:
        iext = os.path.splitext(icon.filename)[1].lower().lstrip(".")
        if iext in SCREENSHOT_EXTS:
            icon_file = write_upload(icon, directory, "icon")
            data["icon"] = icon_file
            data["icon_url"] = f"/static/files/apps/{app_id}/{icon_file}"

    screenshots_names = list(data.get("screenshots_names") or [])
    for i, shot in enumerate(screenshots):
        if shot.filename is None:
            continue
        sext = os.path.splitext(shot.filename)[1].lower().lstrip(".")
        if sext not in SCREENSHOT_EXTS:
            continue
        sname = write_upload(shot, directory, f"shot{len(screenshots_names) + i + 1}")
        screenshots_names.append(sname)
    data["screenshots"] = [f"/static/files/apps/{app_id}/{s}" for s in screenshots_names]
    data["screenshots_names"] = screenshots_names

    data["name"] = name
    data["description"] = description.strip()
    data["os_target"] = os_target
    data["os_label"] = os_target
    data["version"] = version.strip()
    data["developer"] = developer.strip()
    data["modified"] = datetime.now().isoformat()

    write_data(directory, data)
    write_apps_index()
    return {"ok": True, "app": data}


@app.get("/dashboard")
def dashboard():
    return FileResponse(os.path.join(os.path.dirname(os.path.abspath(__file__)), "index.html"))


# Public web (SPA + uploaded files + apps-index.js) served at the root. Must stay last.
app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")