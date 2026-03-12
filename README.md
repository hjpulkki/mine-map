# Mine Map Demo (Leaflet + Image + GeoJSON)

Minimal collaborative-ish map viewer/editor for a cave / underwater mine map:

- Base maps are **JPG image overlays** in a flat 2D coordinate system (no real-world lat/lng).
- Each map keeps its **original aspect ratio**; coordinates are image pixels (x, y).
- Features are **GeoJSON**, per base-image:
  - `<id>-poi.geojson` = green **points of interest**
  - `<id>-blocked.geojson` = red **blocked areas**
  - `<id>-survey.geojson` = blue **survey lines** (optional)
- Coordinate system uses `L.CRS.Simple` with one grid per image: \([0, 0] → [imageHeight, imageWidth]\).
- Leaflet Draw is enabled for **points of interest**, **blocked areas**, and optional **survey lines**, with **export to GeoJSON**.

## Project structure

```
mine-map-demo/
  base/
    mine_map.jpg              <-- your main map (existing default)
    map-2.jpg                 <-- optional additional maps
    map-3.jpg
    ...
  data/
    mine_map-poi.geojson      <-- points of interest for mine_map.jpg
    mine_map-blocked.geojson  <-- blocked areas for mine_map.jpg
    mine_map-survey.geojson   <-- survey lines (optional) for mine_map.jpg
    map-2-poi.geojson         <-- (optional) POIs for map-2.jpg
    map-2-blocked.geojson
    map-2-survey.geojson
  web/
    index.html
    map.js
    styles.css
```

## 1) Add your base map images

At minimum, put your primary JPG at:

`base/mine_map.jpg`

To add more maps, drop additional JPGs using the pattern:

- `base/map-2.jpg`
- `base/map-3.jpg`
- ...

No code changes are required. The viewer will automatically detect those files (if they exist) and add a **base layer switcher** in the Leaflet layer control.

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

- **Pan / zoom** with the mouse.
- Use the **layer control** (top-right):
  - Top section: switch **base map** (e.g. *Mine map*, *Map 2*).
  - Bottom section: toggle overlays:
    - **Points of interest**
    - **Blocked areas**
    - **Survey lines**
    - **Drawn POIs**
    - **Drawn blocked areas**
- Use the **draw tools** (top-left by default):
  - **Marker** → new point of interest (tied to the currently selected base map).
  - **Polygon** → new blocked area (also tied to the current base map).
  - **Polyline** → optional survey line tied to the current base map.
- Click **“Export drawn → GeoJSON”** to download a `drawn_features.geojson`:
  - Each feature includes:
    - `properties.mapId` – which base image it belongs to (e.g. `"mine_map"`, `"map-2"`).
    - `properties.category` – `"poi"` or `"blocked"`.

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

- **Commit `base/mine_map.jpg`** (and any additional `map-*.jpg`) or the maps won’t load.
- Paths are **relative** (the app loads `../base/<id>.jpg` and `../data/<id>-*.geojson` from `/web/`), which works on GitHub Pages as long as you open the `web/` folder URL.

