/* eslint-disable no-alert */
/*
  Mine map demo (Leaflet + image overlay + GeoJSON).

  Updates in this version:
  - Multiple base images (maps) supported.
  - Each map keeps its original aspect ratio (we use the real image size).
  - All GeoJSON files are linked to a specific base image by filename.
  - Drawing tools for:
      * points of interest (markers)
      * blocked areas (polygons)
      * optional survey lines (polylines)

  Coordinate model:
  - We still use L.CRS.Simple (a flat 2D grid, not real-world lat/lng).
  - For each image we treat coordinates as:
      x = horizontal pixel
      y = vertical pixel
    i.e. bounds = [[0, 0], [imageHeight, imageWidth]]
  - This keeps the image undistorted and aligns features with actual pixels.

  File naming convention (important for linking features to maps):
  - Base images live in /base as JPGs.
    Example existing map:
      base/mine_map.jpg

  - For each base image "ID" (filename without extension), we *optionally* load:
      data/<ID>-poi.geojson      -> green "Points of interest"
      data/<ID>-blocked.geojson  -> red "Blocked areas"
      data/<ID>-survey.geojson   -> blue "Survey lines" (optional)

    So for mine_map.jpg we look for:
      base/mine_map.jpg
      data/mine_map-poi.geojson
      data/mine_map-blocked.geojson
      data/mine_map-survey.geojson

  Adding a new map layer:
  - Drop a new JPG into /base using ONE of these patterns:
      mine_map.jpg   (existing default)
      map-2.jpg
      map-3.jpg
      ...
  - (No code changes required.)

  Adding new features for a map:
  - Create a new GeoJSON file that follows the naming pattern above.
  - The viewer will try to load it automatically.
*/

// -----------------------------
// 1) Create the Leaflet map (no bounds yet)
// -----------------------------

const map = L.map("map", {
  crs: L.CRS.Simple,
  minZoom: -4,
  maxZoom: 4,
  zoomControl: true,
});

// We will set maxBounds / fitBounds after we know image sizes.
let globalBounds = null;

// -----------------------------
// 2) Helpers for loading GeoJSON
// -----------------------------

async function fetchGeoJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load ${url} (${res.status} ${res.statusText})`);
  }
  return await res.json();
}

// -----------------------------
// 3) Styles for each feature type
// -----------------------------

// survey lines = blue lines
function surveyLineStyle() {
  return {
    color: "#2563eb", // blue-600
    weight: 3,
    opacity: 0.9,
  };
}

// blocked areas = red polygons / lines
function blockedAreaStyle() {
  return {
    color: "#b91c1c", // red-700
    weight: 2,
    opacity: 0.95,
    fillColor: "#ef4444", // red-500
    fillOpacity: 0.25,
  };
}

// points of interest = green circles
function poiPointToLayer(feature, latlng) {
  return L.circleMarker(latlng, {
    radius: 7,
    color: "#166534", // green-800
    weight: 2,
    fillColor: "#22c55e", // green-500
    fillOpacity: 0.8,
  });
}

function bindFeaturePopup(feature, layer) {
  const props = feature && feature.properties ? feature.properties : {};
  const entries = Object.entries(props);
  if (entries.length === 0) return;
  const lines = entries.map(
    ([k, v]) => `<div><strong>${escapeHtml(String(k))}:</strong> ${escapeHtml(String(v))}</div>`,
  );
  layer.bindPopup(`<div class="popup-props">${lines.join("")}</div>`);
}

function escapeHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// -----------------------------
// 4) Base image and per-map layer management
// -----------------------------

// We support one "special" default map ID plus a range map-2..map-9.
// To add a new layer, just drop e.g. base/map-2.jpg into the base folder.
const BASE_IMAGE_IDS = [
  "mine_map",
  "map-2",
  "map-3",
  "map-4",
  "map-5",
  "map-6",
  "map-7",
  "map-8",
  "map-9",
];

/**
 * Model for each base image:
 * - id:            string (e.g. "mine_map", "map-2")
 * - title:         human-friendly label for the UI
 * - url:           "../base/<id>.jpg"
 * - width/height:  image pixel size
 * - bounds:        [[0,0],[height,width]]
 * - imageOverlay:  L.ImageOverlay
 * - poiLayer:          L.LayerGroup (static points of interest for this map)
 * - blockedLayer:      L.LayerGroup (static blocked areas for this map)
 * - surveyLayer:       L.LayerGroup (static survey lines for this map)
 * - drawnPoiLayer:     L.LayerGroup (user-drawn POIs for this map)
 * - drawnBlockedLayer: L.LayerGroup (user-drawn blocked areas for this map)
 */
const baseMaps = new Map();
let currentBaseId = null;

// Global overlay groups (one per category). Each will contain only the
// sub-layer(s) for the currently active base map.
const overlayLayers = {
  poi: L.layerGroup(),
  blocked: L.layerGroup(),
  survey: L.layerGroup(),
  drawnPoi: L.layerGroup(),
  drawnBlocked: L.layerGroup(),
};

let layerControl = null;

function makeBaseTitle(id) {
  if (id === "mine_map") return "Mine map";
  const match = id.match(/^map-(\d+)$/);
  if (match) return `Map ${match[1]}`;
  return id.replace(/_/g, " ");
}

function createEmptyLayers() {
  return {
    poiLayer: L.layerGroup(),
    blockedLayer: L.layerGroup(),
    surveyLayer: L.layerGroup(),
    drawnPoiLayer: L.layerGroup(),
    drawnBlockedLayer: L.layerGroup(),
  };
}

function loadBaseImage(id) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      if (!width || !height) {
        reject(new Error(`Image ${id} has invalid dimensions.`));
        return;
      }

      const bounds = [
        [0, 0],
        [height, width],
      ];

      const url = `../base/${id}.jpg`;
      const imageOverlay = L.imageOverlay(url, bounds, {
        opacity: 1,
      });

      const layers = createEmptyLayers();

      const base = {
        id,
        title: makeBaseTitle(id),
        url,
        width,
        height,
        bounds,
        imageOverlay,
        ...layers,
      };

      baseMaps.set(id, base);
      resolve(base);
    };
    img.onerror = () => {
      reject(new Error(`Image ../base/${id}.jpg not found or failed to load.`));
    };
    img.src = `../base/${id}.jpg`;
  });
}

async function discoverBaseMaps() {
  const results = await Promise.all(
    BASE_IMAGE_IDS.map((id) => loadBaseImage(id).catch(() => null)),
  );
  const found = results.filter((b) => b !== null);
  if (found.length === 0) {
    throw new Error("No base images found in /base. Expected at least mine_map.jpg.");
  }
  return found;
}

function syncOverlayGroupsForBase(base) {
  overlayLayers.poi.clearLayers();
  overlayLayers.blocked.clearLayers();
  overlayLayers.survey.clearLayers();
  overlayLayers.drawnPoi.clearLayers();
  overlayLayers.drawnBlocked.clearLayers();

  overlayLayers.poi.addLayer(base.poiLayer);
  overlayLayers.blocked.addLayer(base.blockedLayer);
  overlayLayers.survey.addLayer(base.surveyLayer);
  overlayLayers.drawnPoi.addLayer(base.drawnPoiLayer);
  overlayLayers.drawnBlocked.addLayer(base.drawnBlockedLayer);
}

async function loadOptionalLayer(url, buildLayer, register) {
  try {
    const data = await fetchGeoJson(url);
    const layer = buildLayer(data);
    register(layer);
  } catch (err) {
    console.warn(`Skipping optional GeoJSON layer from ${url}`, err);
  }
}

async function loadStaticGeoJsonForBase(base) {
  const id = base.id;
  const prefix = `../data/${id}`;

  await Promise.all([
    // Points of interest (green circles)
    loadOptionalLayer(
      `${prefix}-poi.geojson`,
      (geojson) =>
        L.geoJSON(geojson, {
          pointToLayer: poiPointToLayer,
          onEachFeature: bindFeaturePopup,
        }),
      (layer) => {
        base.poiLayer.addLayer(layer);
      },
    ),

    // Blocked areas (red polygons or lines)
    loadOptionalLayer(
      `${prefix}-blocked.geojson`,
      (geojson) =>
        L.geoJSON(geojson, {
          style: blockedAreaStyle,
          onEachFeature: bindFeaturePopup,
        }),
      (layer) => {
        base.blockedLayer.addLayer(layer);
      },
    ),

    // Survey lines (blue)
    loadOptionalLayer(
      `${prefix}-survey.geojson`,
      (geojson) =>
        L.geoJSON(geojson, {
          style: surveyLineStyle,
          onEachFeature: bindFeaturePopup,
        }),
      (layer) => {
        base.surveyLayer.addLayer(layer);
      },
    ),
  ]);
}

async function initialiseMapsAndLayers() {
  const found = await discoverBaseMaps();

  await Promise.all(found.map((base) => loadStaticGeoJsonForBase(base)));

  const baseLayers = {};
  found.forEach((base) => {
    baseLayers[base.title] = base.imageOverlay;
  });

  const overlayDefs = {
    "Points of interest": overlayLayers.poi,
    "Blocked areas": overlayLayers.blocked,
    "Survey lines": overlayLayers.survey,
    "Drawn POIs": overlayLayers.drawnPoi,
    "Drawn blocked areas": overlayLayers.drawnBlocked,
  };

  layerControl = L.control.layers(baseLayers, overlayDefs, {
    collapsed: false,
  });
  layerControl.addTo(map);

  const firstBase = found[0];
  currentBaseId = firstBase.id;
  globalBounds = firstBase.bounds;
  firstBase.imageOverlay.addTo(map);
  map.fitBounds(globalBounds);
  map.setMaxBounds(globalBounds);

  syncOverlayGroupsForBase(firstBase);
  overlayLayers.poi.addTo(map);
  overlayLayers.blocked.addTo(map);
  overlayLayers.survey.addTo(map);
  overlayLayers.drawnPoi.addTo(map);
  overlayLayers.drawnBlocked.addTo(map);

  map.on("baselayerchange", (evt) => {
    const base = Array.from(baseMaps.values()).find(
      (b) => b.imageOverlay === evt.layer,
    );
    if (!base) return;
    currentBaseId = base.id;
    globalBounds = base.bounds;
    map.fitBounds(globalBounds);
    map.setMaxBounds(globalBounds);
    syncOverlayGroupsForBase(base);
  });
}

initialiseMapsAndLayers().catch((err) => {
  console.error(err);
  alert(
    "Failed to load base images or GeoJSON. Open DevTools Console for details.\n\n" +
      "Check that at least base/mine_map.jpg exists.",
  );
});

// -----------------------------
// 5) Drawing tools (POIs, blocked areas, survey lines)
// -----------------------------

const drawControl = new L.Control.Draw({
  edit: {
    featureGroup: L.layerGroup(),
  },
  draw: {
    marker: true,
    polygon: {
      shapeOptions: blockedAreaStyle(),
    },
    polyline: {
      shapeOptions: surveyLineStyle(),
    },
    rectangle: false,
    circle: false,
    circlemarker: false,
  },
});
map.addControl(drawControl);

map.on(L.Draw.Event.CREATED, (evt) => {
  const layer = evt.layer;
  const type = evt.layerType;

  const base = currentBaseId ? baseMaps.get(currentBaseId) : null;
  if (!base) {
    console.warn("Drawn feature ignored: no active base map.");
    return;
  }

  if (type === "marker") {
    base.drawnPoiLayer.addLayer(layer);
  } else if (type === "polygon") {
    base.drawnBlockedLayer.addLayer(layer);
  } else if (type === "polyline") {
    base.surveyLayer.addLayer(layer);
  }

  syncOverlayGroupsForBase(base);
});

// -----------------------------
// 6) Export drawn features to GeoJSON (linked to maps)
// -----------------------------

document.getElementById("exportGeoJsonBtn").addEventListener("click", () => {
  const features = [];

  baseMaps.forEach((base) => {
    const pushFeatures = (sourceLayer, category) => {
      const coll = sourceLayer.toGeoJSON();
      if (!coll || !coll.features) return;
      coll.features.forEach((f) => {
        features.push({
          ...f,
          properties: {
            ...(f.properties || {}),
            mapId: base.id,
            category,
          },
        });
      });
    };

    pushFeatures(base.drawnPoiLayer, "poi");
    pushFeatures(base.drawnBlockedLayer, "blocked");
  });

  const fc = {
    type: "FeatureCollection",
    features,
  };

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

