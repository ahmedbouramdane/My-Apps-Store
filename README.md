# My Apps Store

A repository for the My Apps Store project, which hosts downloadable applications and softwares.

## Structure

- **`dashboard/`** — FastAPI admin panel to upload apps (package + metadata + screenshots). Files are saved into `docs/static/files/apps/` and a static index `docs/static/apps-index.js` is generated for the site.
- **`docs/`** — Static website (deployable to GitHub Pages) that lists the uploaded apps with a responsive design, a SplideJS screenshot carousel, and a hash-routed detail page.

## Run the dashboard locally

```bash
cd dashboard
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Then open `http://localhost:8000/dashboard`.

## Deploy the static site

Push `docs/` to GitHub Pages (as with the 2BAC project). The static site reads `static/apps-index.js` only — no backend required.