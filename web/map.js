/* eslint-disable no-alert */
/*
  Mine map demo (Leaflet + image overlay + GeoJSON).

  v3 goals:
  - Multiple base images (maps) supported.
  - Each image keeps its original aspect ratio (we use real pixel sizes).
  - Every GeoJSON file becomes its own toggleable overlay layer.
  - Drawing tools for:
      * points of interest (markers)
      * blocked areas (polygons)
      * optional survey lines (polylines)
  - All drawn features are tagged with the current base map ID.

  Coordinate model:
  - We use L.CRS.Simple (flat 2D grid, not real-world lat/lng).
  - For each image:
      x = horizontal pixel
      y = vertical pixel
    Leaflet bounds for that image are [[0, 0], [imageHeight, imageWidth]].

  File naming convention:
  - Base images live in /base as JPGs.
    Example:
      base/mine_map.jpg
      base/58.jpg

  - For each base image ID (filename without extension), we *optionally* load
    any GeoJSON file whose name matches:
      data/<ID>-<suffix>.geojson

    Suffixes we currently recognise:
      - poi       -> green "Points of interest"
      - blocked   -> red "Blocked areas"
      - survey    -> blue "Survey lines" (optional)
      - dynyboksi -> treated as "Blocked areas" (for your 58-dynyboksi.geojson)

    So for 58.jpg we will automatically look for:
      data/58-poi.geojson
      data/58-blocked.geojson
      data/58-survey.geojson
      data/58-dynyboksi.geojson

  Adding a new map layer:
  - Drop a new JPG into /base using one of:
      mine_map.jpg   (existing default)
      58.jpg
      map-2.jpg
      map-3.jpg
      ...
  - (No code changes required for these IDs.)

  Adding new static features for a map:
  - Create a new GeoJSON file named:
      <ID>-poi.geojson
      <ID>-blocked.geojson
      <ID>-survey.geojson
      (or <ID>-dynyboksi.geojson for map 58)
  - Each file becomes a separate overlay in the layer control, named
    "<Map title> – <Layer label>".
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

let currentBaseId = null;

// -----------------------------
// 2) Helpers
// -----------------------------

async function fetchGeoJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load ${url} (${res.status} ${res.statusText})`);
  }
  return await res.json();
}

function escapeHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

// -----------------------------
// 4) Recognised GeoJSON layer types (per base image ID).
// -----------------------------

const LAYER_DEFS = {
  poi: {
    label: "Points of interest",
    build(geojson) {
      return L.geoJSON(geojson, {
        pointToLayer: poiPointToLayer,
        onEachFeature: bindFeaturePopup,
      });
    },
  },
  blocked: {
    label: "Blocked areas",
    build(geojson) {
      return L.geoJSON(geojson, {
        style: blockedAreaStyle,
        onEachFeature: bindFeaturePopup,
      });
    },
  },
  survey: {
    label: "Survey lines",
    build(geojson) {
      return L.geoJSON(geojson, {
        style: surveyLineStyle,
        onEachFeature: bindFeaturePopup,
      });
    },
  },
  dynyboksi: {
    // Special-case layer name for your 58-dynyboksi.geojson.
    label: "Dynyboksi",
    build(geojson) {
      return L.geoJSON(geojson, {
        style: blockedAreaStyle,
        onEachFeature: bindFeaturePopup,
      });
    },
  },
};

// -----------------------------
// 5) Base images
// -----------------------------

// We support specific IDs that we will attempt to load as JPGs.
const BASE_IMAGE_IDS = [
  "mine_map",
  "58", // your second map: 58.jpg
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
 * - id:            string (e.g. "mine_map", "58")
 * - title:         human-friendly label for the UI
 * - url:           "../base/<id>.jpg"
 * - width/height:  image pixel size
 * - bounds:        [[0,0],[height,width]]
 * - imageOverlay:  L.ImageOverlay
 * - overlays: { [suffix: string]: L.LayerGroup }
 */
const baseMaps = new Map();

function makeBaseTitle(id) {
  if (id === "mine_map") return "Mine map";
  // "58" -> "58", "map-2" -> "Map 2", etc.
  const match = id.match(/^map-(\d+)$/);
  if (match) return `Map ${match[1]}`;
  return id.replace(/_/g, " ");
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

      const base = {
        id,
        title: makeBaseTitle(id),
        url,
        width,
        height,
        bounds,
        imageOverlay,
        overlays: {}, // filled in after we load GeoJSON
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

async function loadOptionalLayer(url, buildLayer, targetGroup) {
  try {
    const data = await fetchGeoJson(url);
    const layer = buildLayer(data);
    targetGroup.addLayer(layer);
  } catch (err) {
    console.warn(`Skipping optional GeoJSON layer from ${url}`, err);
  }
}

async function loadStaticGeoJsonForBase(base) {
  const id = base.id;
  const prefix = `../data/${id}`;

  const loadPromises = Object.entries(LAYER_DEFS).map(
    async ([suffix, def]) => {
      const group = L.layerGroup();
      base.overlays[suffix] = group;

      await loadOptionalLayer(
        `${prefix}-${suffix}.geojson`,
        (geojson) => def.build(geojson),
        group,
      );
    },
  );

  await Promise.all(loadPromises);
}

// -----------------------------
// 6) Initialise images, overlays, and layer control
// -----------------------------

// All drawn features from the editor (for all maps) go here.
const drawnItems = new L.FeatureGroup();
map.addLayer(drawnItems);

let layerControl = null;

async function initialiseMapsAndLayers() {
  const found = await discoverBaseMaps();

  // Load optional static layers per base.
  await Promise.all(found.map((base) => loadStaticGeoJsonForBase(base)));

  // Build base layer and overlay dictionaries for Leaflet's control.
  const baseLayers = {};
  const overlayLayers = {};

  found.forEach((base) => {
    baseLayers[base.title] = base.imageOverlay;

    for (const [suffix, def] of Object.entries(LAYER_DEFS)) {
      const group = base.overlays[suffix];
      if (group && group.getLayers().length > 0) {
        const overlayName = `${base.title} – ${def.label}`;
        overlayLayers[overlayName] = group;
      }
    }
  });

  // Drawn items overlay (active for all maps).
  overlayLayers["Drawn features"] = drawnItems;

  layerControl = L.control.layers(baseLayers, overlayLayers, {
    collapsed: false,
  });
  layerControl.addTo(map);

  // Activate the first available base map.
  const firstBase = found[0];
  currentBaseId = firstBase.id;
  firstBase.imageOverlay.addTo(map);
  map.fitBounds(firstBase.bounds);
  map.setMaxBounds(firstBase.bounds);

  // Optionally, turn on that map's static overlays by default.
  for (const [suffix, def] of Object.entries(LAYER_DEFS)) {
    const group = firstBase.overlays[suffix];
    if (group && group.getLayers().length > 0) {
      const overlayName = `${firstBase.title} – ${def.label}`;
      const layer = overlayLayers[overlayName];
      if (layer && !map.hasLayer(layer)) {
        map.addLayer(layer);
      }
    }
  }
  map.addLayer(drawnItems);

  // When switching base maps, update bounds.
  map.on("baselayerchange", (evt) => {
    const base = Array.from(baseMaps.values()).find(
      (b) => b.imageOverlay === evt.layer,
    );
    if (!base) return;

    currentBaseId = base.id;
    map.fitBounds(base.bounds);
    map.setMaxBounds(base.bounds);
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
// 7) Drawing tools (POIs, blocked areas, survey lines)
// -----------------------------

const drawControl = new L.Control.Draw({
  edit: {
    featureGroup: drawnItems,
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

  const mapId = currentBaseId;
  const category =
    type === "marker" ? "poi" : type === "polygon" ? "blocked" : "survey";

  if (!layer.feature) {
    layer.feature = {
      type: "Feature",
      properties: {},
    };
  }
  layer.feature.properties = {
    ...(layer.feature.properties || {}),
    mapId,
    category,
  };

  drawnItems.addLayer(layer);
});

// -----------------------------
// 8) Export drawn features to GeoJSON
// -----------------------------

document.getElementById("exportGeoJsonBtn").addEventListener("click", () => {
  const fc = drawnItems.toGeoJSON();
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

