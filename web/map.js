/* eslint-disable no-alert */
/*
  Mine map demo (Leaflet + image overlay + GeoJSON).

  Key idea:
  - We are NOT using real-world coordinates.
  - We treat the map like a simple 2D drawing surface with coordinates in the
    range 0..1000 (you can pick any range you want).
  - Leaflet supports this via L.CRS.Simple.

  Coordinate conventions (important!):
  - GeoJSON stores positions as [x, y] (conceptually [east, north] or [col, row]).
  - Leaflet uses LatLng order internally: [lat, lng].
  - With L.CRS.Simple, Leaflet interprets:
      lng = x (horizontal)
      lat = y (vertical)
    So our GeoJSON [x, y] maps nicely to Leaflet as [lng, lat] under the hood.
*/

// -----------------------------
// 1) Define the image coordinate system
// -----------------------------

// Our "map coordinates" are 0..1000 in both X and Y.
// - X grows to the right
// - Y grows downward (in L.CRS.Simple, the origin is top-left by convention)
const IMAGE_SIZE = 1000;

// Leaflet bounds are [[southWestLat, southWestLng], [northEastLat, northEastLng]]
// but with Simple CRS "lat" is just Y and "lng" is just X.
//
// Here:
// - top-left is [0, 0]
// - bottom-right is [1000, 1000]
const imageBounds = [
  [0, 0],
  [IMAGE_SIZE, IMAGE_SIZE],
];

// -----------------------------
// 2) Create the Leaflet map
// -----------------------------

const map = L.map("map", {
  crs: L.CRS.Simple,

  // These keep navigation sane for image maps.
  minZoom: -2,
  maxZoom: 4,

  // Prevent panning infinitely away from the image.
  maxBounds: imageBounds,
  maxBoundsViscosity: 1.0,

  // We only use the image overlay; no tile layer.
  zoomControl: true,
});

// Fit the view to the image bounds on first load.
map.fitBounds(imageBounds);

// -----------------------------
// 3) Add the JPG as an image overlay
// -----------------------------

// IMPORTANT:
// - Put your real JPG at: mine-map-demo/base/mine_map.jpg
// - This demo references it from /web/ as ../base/mine_map.jpg
const imageUrl = "../base/mine_map.jpg";

const baseImage = L.imageOverlay(imageUrl, imageBounds, {
  // If the image is large, this helps performance when panning/zooming.
  // (Leaflet uses CSS transforms; "pixelated" is optional and depends on your art.)
  opacity: 1,
});

baseImage.addTo(map);

// -----------------------------
// 4) Helpers for loading GeoJSON
// -----------------------------

async function fetchGeoJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load ${url} (${res.status} ${res.statusText})`);
  }
  return await res.json();
}

// Small helper to build consistent layer names in the control.
function addToLayerControl(control, layer, name) {
  control.addOverlay(layer, name);
  return layer;
}

// -----------------------------
// 5) Define styles for each feature type
// -----------------------------

// cave_lines = blue lines
function caveLineStyle() {
  return {
    color: "#2563eb", // blue-600
    weight: 3,
    opacity: 0.9,
  };
}

// rubble = red polygons
function rubbleStyle() {
  return {
    color: "#b91c1c", // red-700
    weight: 2,
    opacity: 0.95,
    fillColor: "#ef4444", // red-500
    fillOpacity: 0.25,
  };
}

// caverns = green circles
function cavernPointToLayer(feature, latlng) {
  // latlng is in our simple coordinate system.
  return L.circleMarker(latlng, {
    radius: 7,
    color: "#166534", // green-800
    weight: 2,
    fillColor: "#22c55e", // green-500
    fillOpacity: 0.8,
  });
}

function bindFeaturePopup(feature, layer) {
  // Optional: show properties on click.
  // If you don't want popups, you can remove this.
  const props = feature && feature.properties ? feature.properties : {};
  const lines = Object.entries(props).map(
    ([k, v]) => `<div><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v))}</div>`,
  );
  if (lines.length > 0) {
    layer.bindPopup(`<div class="popup-props">${lines.join("")}</div>`);
  }
}

// Basic HTML escaping for popup content.
function escapeHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// -----------------------------
// 6) Load and add the GeoJSON layers
// -----------------------------

// Layer control (toggle checkboxes). We’ll add overlays after they load.
const layerControl = L.control.layers(
  // base layers (none; our image is not a "base layer" in Leaflet's sense here)
  undefined,
  // overlays (added later)
  undefined,
  { collapsed: false },
);
layerControl.addTo(map);

// We keep references so we can export / manipulate later.
let caveLinesLayer;
let rubbleLayer;
let cavernsLayer;
let userSurveyLayer; // e.g. your yk58-osa.geojson

async function loadOptionalLayer(url, buildLayer, register) {
  try {
    const data = await fetchGeoJson(url);
    const layer = buildLayer(data);
    register(layer);
    layer.addTo(map);
  } catch (err) {
    // If a file is missing or blocked (e.g. when opened via file://),
    // we just log a warning instead of breaking the whole app.
    console.warn(`Skipping optional layer from ${url}`, err);
  }
}

async function loadAllLayers() {
  // NOTE:
  // - These loads are *optional*. Missing files only produce console warnings.
  // - They will only work when the app is served over HTTP(S),
  //   not from a file:// URL.

  await Promise.all([
    // Example cave_lines.geojson (blue polylines).
    loadOptionalLayer(
      "../data/cave_lines.geojson",
      (geojson) =>
        L.geoJSON(geojson, {
          style: caveLineStyle,
          onEachFeature: bindFeaturePopup,
        }),
      (layer) => {
        caveLinesLayer = layer;
        addToLayerControl(layerControl, layer, "Cave lines (blue, example)");
      },
    ),

    // Example rubble.geojson (red polygons).
    loadOptionalLayer(
      "../data/rubble.geojson",
      (geojson) =>
        L.geoJSON(geojson, {
          style: rubbleStyle,
          onEachFeature: bindFeaturePopup,
        }),
      (layer) => {
        rubbleLayer = layer;
        addToLayerControl(layerControl, layer, "Rubble (red, example)");
      },
    ),

    // Example caverns.geojson (green points).
    loadOptionalLayer(
      "../data/caverns.geojson",
      (geojson) =>
        L.geoJSON(geojson, {
          pointToLayer: cavernPointToLayer,
          onEachFeature: bindFeaturePopup,
        }),
      (layer) => {
        cavernsLayer = layer;
        addToLayerControl(layerControl, layer, "Caverns (green, example)");
      },
    ),

    // Your saved survey from Leaflet Draw (e.g. yk58-osa.geojson).
    loadOptionalLayer(
      "../data/yk58-osa.geojson",
      (geojson) =>
        L.geoJSON(geojson, {
          style: caveLineStyle,
          onEachFeature: bindFeaturePopup,
        }),
      (layer) => {
        userSurveyLayer = layer;
        addToLayerControl(layerControl, layer, "Cave survey (yk58-osa)");
      },
    ),
  ]);
}

// This will silently skip any missing layers when run via file://.
loadAllLayers();

// -----------------------------
// 7) Nice-to-have: Leaflet Draw (draw new cave lines) + export to GeoJSON
// -----------------------------

// This layer stores anything the user draws (so we can export it later).
const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);
addToLayerControl(layerControl, drawnItems, "Drawn features");

const drawControl = new L.Control.Draw({
  edit: {
    featureGroup: drawnItems,
  },
  draw: {
    // For this cave-map demo we focus on polylines (cave lines).
    polyline: {
      shapeOptions: caveLineStyle(),
    },

    // Disable other tools to keep UI minimal.
    polygon: false,
    rectangle: false,
    circle: false,
    circlemarker: false,
    marker: false,
  },
});
map.addControl(drawControl);

map.on(L.Draw.Event.CREATED, (evt) => {
  const layer = evt.layer;
  drawnItems.addLayer(layer);
});

// Export button: downloads a .geojson file of what the user drew.
document.getElementById("exportGeoJsonBtn").addEventListener("click", () => {
  const fc = drawnItems.toGeoJSON();

  // Add a tiny hint that these are "cave lines" (optional).
  // Leaflet Draw emits features with empty properties by default.
  for (const f of fc.features || []) {
    f.properties = {
      ...(f.properties || {}),
      source: "leaflet-draw",
      type: f.geometry?.type,
    };
  }

  downloadJson(fc, "drawn_features.geojson");
});

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

