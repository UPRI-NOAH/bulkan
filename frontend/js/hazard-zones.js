// Lahar / PDC / Lava Flow hazard zone overlays on the Risk Zones map. Each
// hazard is switched on above the map, independently of the km radius circle;
// its zones (e.g. Lahar High) are then switched on and off in the map legend.
import { state } from './state.js';
import { HAZARD_LAYERS, HAZARD_ZONES_MANIFEST_URL } from './config.js';
import { updateSchoolRisk } from './school-risk.js';

// Hazards switched on, and zones switched off within them ("<hazard>:<zone>").
// Both are kept when switching volcano.
const enabled = new Set();
const hiddenZones = new Set();
const key = (id, zone) => `${id}:${zone}`;
const geojsonCache = {};
let manifestPromise = null;
let renderToken = 0;
let hazardLayer = null;
let legend = null;
let legendCollapsed = null; // kept across redraws; starts collapsed on phones
// Hazards and zones the current volcano has maps for, from the manifest.
let available = {};

const zonesOn = id => (available[id]?.zones || []).filter(z => !hiddenZones.has(key(id, z)));

function loadManifest() {
  manifestPromise ||= fetch(HAZARD_ZONES_MANIFEST_URL, { cache: 'no-cache' })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .catch(e => {
      manifestPromise = null;
      throw e;
    });
  return manifestPromise;
}

async function loadGeojson(url) {
  if (!geojsonCache[url]) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    geojsonCache[url] = await res.json();
  }
  return geojsonCache[url];
}

function renderToggles(vol) {
  const el = document.getElementById('hazard-toggles');
  if (!el) return;
  el.innerHTML = Object.entries(HAZARD_LAYERS).map(([id, hazard]) => {
    const on = enabled.has(id) && Boolean(available[id]);
    const swatch = Object.values(hazard.zones)[0].color;
    return `
      <button type="button" data-hazard="${id}" class="${on ? 'active' : ''}" aria-pressed="${on}"
        ${available[id] ? '' : `disabled title="No ${hazard.label} hazard map for ${vol} yet"`}>
        <span class="hazard-swatch" style="background:${swatch}"></span>${hazard.label}
      </button>`;
  }).join('');
}

// Lists every zone of the switched-on hazards; each entry toggles its zone.
function makeLegend(shown) {
  const control = L.control({ position: 'bottomleft' });
  control.onAdd = () => {
    // Same look and phone behavior as the ash legend: tap the title to collapse.
    const div = L.DomUtil.create('div', 'ash-legend hazard-legend');
    legendCollapsed ??= window.matchMedia('(max-width:600px)').matches;
    div.classList.toggle('collapsed', legendCollapsed);
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
    div.innerHTML = '<div class="legend-title ash-legend-toggle">Hazard zones</div>' + shown.map(id => `
      <div class="legend-item hazard-legend-group">${HAZARD_LAYERS[id].label}</div>
      ${available[id].zones.map(z => {
        const zone = HAZARD_LAYERS[id].zones[z];
        const on = !hiddenZones.has(key(id, z));
        return `
          <button type="button" class="legend-item hazard-legend-zone ${on ? '' : 'off'}" data-hazard="${id}" data-zone="${z}"
            aria-pressed="${on}" title="${on ? 'Hide' : 'Show'} ${HAZARD_LAYERS[id].label} ${zone.label.toLowerCase()}">
            <span class="hazard-legend-swatch" style="background:${zone.color}66;border-color:${zone.color};border-style:${zone.dashArray ? 'dashed' : 'solid'}"></span>
            <span>${zone.label}</span>
          </button>`;
      }).join('')}`).join('');
    div.addEventListener('click', e => {
      if (e.target.closest('.ash-legend-toggle')) {
        legendCollapsed = div.classList.toggle('collapsed');
        return;
      }
      const button = e.target.closest('.hazard-legend-zone');
      if (!button) return;
      const k = key(button.dataset.hazard, button.dataset.zone);
      if (hiddenZones.has(k)) hiddenZones.delete(k);
      else hiddenZones.add(k);
      updateHazardZones();
    });
    return div;
  };
  return control;
}

function drawZones(id, geojson, zones) {
  const hazard = HAZARD_LAYERS[id];
  // Least severe first so the nested, more severe zones sit on top.
  return [...zones].reverse().map(z => {
    const zone = hazard.zones[z];
    return L.geoJSON(geojson, {
      pane: 'hazardPane',
      filter: f => f.properties.zone === z,
      style: {
        color: zone.color,
        weight: 1.5,
        opacity: 0.9,
        dashArray: zone.dashArray,
        fillColor: zone.color,
        fillOpacity: 0.25,
      },
    }).bindTooltip(`${hazard.label} · ${zone.label}`, { sticky: true }).addTo(hazardLayer);
  });
}

// Redraws the switched-on hazards for the current volcano. `focus` is a
// hazard just switched on: the map pans out to it if it isn't fully in view.
export async function updateHazardZones(focus) {
  if (!hazardLayer) return;
  const vol = state.currentVolcano;
  const token = ++renderToken;

  let manifest = {};
  try {
    manifest = (await loadManifest()).volcanoes?.[vol] || {};
  } catch (e) {
    console.error('[hazard-zones] failed to load hazard zone manifest:', e);
  }
  if (token !== renderToken) return;
  available = manifest;
  state.hazardMapsAvailable = Object.keys(available).length > 0;
  renderToggles(vol);

  const shown = Object.keys(HAZARD_LAYERS).filter(id => enabled.has(id) && available[id]);
  let data;
  try {
    data = await Promise.all(shown.map(id => loadGeojson(available[id].url)));
  } catch (e) {
    console.error(`[hazard-zones] failed to load ${vol} hazard zones:`, e);
    data = null;
  }
  // The user may have switched volcano or toggled again while files loaded.
  if (token !== renderToken) return;
  hazardLayer.clearLayers();
  legend?.remove();
  legend = null;
  // A hazard with every zone hidden stays in the legend but covers nothing.
  state.activeHazards = data
    ? shown
      .map((id, i) => ({ id, volcano: vol, geojson: data[i], zones: zonesOn(id) }))
      .filter(h => h.zones.length)
    : [];
  updateSchoolRisk();
  if (!data || shown.length === 0) return;

  const layers = {};
  shown.forEach((id, i) => { layers[id] = drawZones(id, data[i], zonesOn(id)); });
  legend = makeLegend(shown).addTo(state.map);

  if (focus && layers[focus]?.length) {
    const bounds = L.featureGroup(layers[focus]).getBounds();
    if (bounds.isValid() && !state.map.getBounds().contains(bounds)) {
      state.map.flyToBounds(bounds, { padding: [20, 20], duration: 1 });
    }
  }
}

export function initHazardZones() {
  if (!state.map) return;
  // Above the km circle (overlay pane, 400), below markers and popups.
  state.map.createPane('hazardPane').style.zIndex = 410;
  hazardLayer = L.layerGroup().addTo(state.map);

  document.getElementById('hazard-toggles')?.addEventListener('click', e => {
    const button = e.target.closest('button[data-hazard]');
    if (!button || button.disabled) return;
    const id = button.dataset.hazard;
    const on = !enabled.has(id);
    if (on) {
      enabled.add(id);
      // Switching a hazard on starts with all its zones showing.
      for (const z of Object.keys(HAZARD_LAYERS[id].zones)) hiddenZones.delete(key(id, z));
    } else {
      enabled.delete(id);
    }
    updateHazardZones(on ? id : undefined);
  });
  updateHazardZones();
}
