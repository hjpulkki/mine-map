# Mine Map Demo (Leaflet + Image + GeoJSON)

Minimal collaborative-ish map viewer/editor for a cave / underwater mine map:

- Base map is a **JPG image overlay**
- Features are **GeoJSON**:
  - `data/cave_lines.geojson` = blue lines
  - `data/caverns.geojson` = green circles
  - `data/rubble.geojson` = red polygons
- Coordinate system is **simple 2D** (not real-world), using `L.CRS.Simple`
  - Coordinates are in the range **0–1000** (both X and Y)
- Nice-to-have included: **Leaflet Draw** (draw new cave lines) + **export drawn features to GeoJSON**

## Project structure

```
mine-map-demo/
  base/
    mine_map.jpg              <-- you add this
  data/
    cave_lines.geojson
    caverns.geojson
    rubble.geojson
  web/
    index.html
    map.js
    styles.css
```

## 1) Add your base map image

Put your JPG at:

`base/mine_map.jpg`

The app expects that exact filename.

## 2) Run locally (recommended)

Browsers block `fetch()` from `file://` URLs, so you must serve the files with a local web server.

### Option A: Python (easy)

From the `mine-map-demo/` folder:

```bash
python -m http.server 8080
```

Then open:

`http://localhost:8080/web/`

### Option B: Node (http-server)

```bash
npx http-server -p 8080
```

Then open:

`http://localhost:8080/web/`

## 3) Use the app

- **Pan / zoom** with the mouse
- Use the **layer control** (top-right) to toggle cave lines / caverns / rubble / drawn features
- Use the **draw tool** to draw new cave lines
- Click **“Export drawn → GeoJSON”** to download a `drawn_features.geojson`

## 4) Host on GitHub Pages

Because this is a static site, GitHub Pages works well.

### Simple approach (recommended): publish the `mine-map-demo/` folder

1. Create a GitHub repo (example name: `mine-map-demo`).
2. Commit and push this folder.
3. In GitHub:
   - **Settings → Pages**
   - **Build and deployment**
   - **Source**: “Deploy from a branch”
   - **Branch**: `main`
   - **Folder**: `/ (root)` if your repo root is `mine-map-demo/`
     - If you put `mine-map-demo/` *inside* a larger repo, pick the folder that contains `web/`, `data/`, and `base/`.
4. Wait for Pages to deploy.
5. Visit the Pages URL, and open `/web/` on that site.

Example:
- Site: `https://YOURNAME.github.io/YOURREPO/`
- App: `https://YOURNAME.github.io/YOURREPO/web/`

### Important notes for Pages

- **Commit `base/mine_map.jpg`** (or your base map won’t load).
- Paths are **relative** (the app loads `../base/mine_map.jpg` and `../data/*.geojson` from `/web/`), which works on GitHub Pages as long as you open the `web/` folder URL.

