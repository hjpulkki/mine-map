/* eslint-disable no-alert */
/*
  Single-project viewer.

  Folder structure:
    data/{project_id}/
      000_map.jpg
      001_index.json      -> list of GeoJSON filenames to load (array of strings)
      <anything>.geojson  -> layers listed in the index

  For now we hardcode:
    project_id = "base"

  Rules:
  - One base image only (no base layer selection UI).
  - Every GeoJSON file listed in 001_index.json becomes its own toggleable layer.
  - No hardcoded layer names: we use the filename as the layer label.
  - Coordinates are treated as image pixels in a simple 2D plane (L.CRS.Simple).
*/

const PROJECT_ID = "base";
const PROJECT_DIR = `../data/${PROJECT_ID}`;
const MAP_URL = `${PROJECT_DIR}/000_map.jpg`;
const INDEX_URL = `${PROJECT_DIR}/001_index.json`;

const map = L.map("map", {
  crs: L.CRS.Simple,
  minZoom: -4,
  maxZoom: 4,
  zoomControl: true,
});

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  return await res.json();
}

function loadImageSize(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () =>
      resolve({
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
      });
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: "application/geo+json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const drawn = new L.FeatureGroup();
map.addLayer(drawn);

map.addControl(
  new L.Control.Draw({
    edit: { featureGroup: drawn },
    draw: {
      marker: true,
      polygon: true,
      polyline: true,
      rectangle: false,
      circle: false,
      circlemarker: false,
    },
  }),
);

map.on(L.Draw.Event.CREATED, (evt) => {
  drawn.addLayer(evt.layer);
});

document.getElementById("exportGeoJsonBtn").addEventListener("click", () => {
  downloadJson(drawn.toGeoJSON(), "drawn_features.geojson");
});

async function main() {
  const { width, height } = await loadImageSize(MAP_URL);
  if (!width || !height) throw new Error(`Invalid image size: ${MAP_URL}`);

  const bounds = [
    [0, 0],
    [height, width],
  ];

  L.imageOverlay(MAP_URL, bounds, { opacity: 1 }).addTo(map);
  map.fitBounds(bounds);
  map.setMaxBounds(bounds);

  const index = await fetchJson(INDEX_URL);
  if (!Array.isArray(index)) throw new Error(`Index must be an array: ${INDEX_URL}`);

  const overlays = { drawn };

  for (const filename of index) {
    if (typeof filename !== "string" || filename.trim() === "") continue;
    const geojson = await fetchJson(`${PROJECT_DIR}/${filename}`);
    const layer = L.geoJSON(geojson);
    overlays[filename] = layer;
    layer.addTo(map);
  }

  L.control.layers(undefined, overlays, { collapsed: false }).addTo(map);
}

main().catch((err) => {
  console.error(err);
  alert(String(err));
});

