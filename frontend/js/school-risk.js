// School Risk Assessment: the DepEd schools inside the hazard zones switched
// on on the Risk Zones map, as a list per zone and as markers on the map.
import { state } from './state.js';
import { VOLCANO_META } from './config.js';
import { calculateDistance } from './schools.js';

// A school's status comes from the zones it is in (HAZARD_ZONES `status`).
const STATUS_COLORS = { Critical: '#ff4444', Priority: '#ff8c2a', Moderate: '#ffc62a' };
const STATUS_RANK = { Critical: 0, Priority: 1, Moderate: 2 };
const SCHOOLS_PER_SECTION = 100;

const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

// ── Hazard polygons ─────────────────────────────────────────────────────────

const preparedCache = new WeakMap();

// zone → polygons ([outer, ...holes] in [lng, lat]) with a bounding box each.
function prepare(geojson) {
  if (!preparedCache.has(geojson)) {
    const byZone = {};
    for (const f of geojson.features) {
      const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const rings of polygons) {
        const xs = rings[0].map(p => p[0]), ys = rings[0].map(p => p[1]);
        (byZone[f.properties.zone] ||= []).push({
          rings,
          bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
        });
      }
    }
    preparedCache.set(geojson, byZone);
  }
  return preparedCache.get(geojson);
}

function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[j];
    if ((y1 > lat) !== (y2 > lat) && lng < (x2 - x1) * (lat - y1) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

const inPolygons = (lng, lat, polygons) => polygons.some(({ rings, bbox }) =>
  lng >= bbox[0] && lng <= bbox[2] && lat >= bbox[1] && lat <= bbox[3]
  && pointInRing(lng, lat, rings[0]) && !rings.slice(1).some(h => pointInRing(lng, lat, h)));

// ── Assessment ──────────────────────────────────────────────────────────────

// Sections (one per hazard zone, in display order) and every listed school
// once, with its worst status across the zones it falls in.
function assess() {
  const vol = state.currentVolcano;
  const vent = VOLCANO_META[vol].coords;
  const sections = [];
  const schools = new Map();

  const add = (section, school, status, label) => {
    const key = school.id || school.name;
    let entry = schools.get(key);
    if (!entry) {
      entry = {
        key,
        name: school.name,
        lat: school.lat,
        lng: school.lng,
        type: school.type || 'School',
        municipality: school.municipality || '',
        distance: calculateDistance(vent[0], vent[1], school.lat, school.lng),
        status,
        layers: [],
      };
      schools.set(key, entry);
    }
    if (STATUS_RANK[status] < STATUS_RANK[entry.status]) entry.status = status;
    entry.layers.push(label);
    section.schools.push(entry);
  };

  for (const { volcano, geojson, zones, layer: hazard } of state.activeHazards) {
    if (volcano !== vol) continue;
    const byZone = prepare(geojson);
    const zoneSections = zones.map(z => ({
      zone: z,
      title: `${hazard.label} · ${hazard.zones[z].label}`,
      hazardLabel: hazard.label,
      zoneShort: hazard.zones[z].label.replace(/ (hazard|zone)$/i, ''),
      color: hazard.zones[z].color,
      schools: [],
    }));
    const all = Object.values(byZone).flat().map(p => p.bbox);
    const [minX, minY, maxX, maxY] = [0, 1, 2, 3].map(i => (i < 2 ? Math.min : Math.max)(...all.map(b => b[i])));
    for (const s of state.allDepEdSchools) {
      if (s.lng < minX || s.lng > maxX || s.lat < minY || s.lat > maxY) continue;
      // Zones are most severe first, so a school in nested zones gets the worst.
      const section = zoneSections.find(zs => inPolygons(s.lng, s.lat, byZone[zs.zone] || []));
      if (section) add(section, s, hazard.zones[section.zone].status, section.title);
    }
    zoneSections.forEach(zs => zs.schools.sort((a, b) => a.distance - b.distance));
    sections.push(...zoneSections);
  }
  return { sections, schools: [...schools.values()] };
}

// ── Map markers ─────────────────────────────────────────────────────────────

let markerLayer = null;
let markers = {};

function drawMarkers(schools) {
  markerLayer ||= L.layerGroup().addTo(state.map);
  markerLayer.clearLayers();
  markers = {};
  for (const s of schools) {
    const color = STATUS_COLORS[s.status] || '#8892a8';
    const icon = L.divIcon({
      html: `<div style="width:16px;height:16px;background-color:${color};border:2.5px solid #e8eaf0;border-radius:3px;box-shadow:0 2px 8px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;">📚</div>`,
      iconSize: [20, 20],
      className: 'school-marker',
    });
    const marker = L.marker([s.lat, s.lng], { icon });
    marker.bindPopup(() => `
      <div style="font-family:'JetBrains Mono',monospace;font-size:12px;min-width:240px;color:#e8eaf0;background:var(--surface);border:1px solid var(--border);border-radius:6px;">
        <div style="background:var(--surface2);padding:0.75rem;border-bottom:1px solid var(--border);border-radius:6px 6px 0 0;">
          <strong style="color:#ff6b35;font-size:13px;">📚 SCHOOL (${esc(s.type)})</strong>
        </div>
        <div style="padding:0.75rem;">
          <div style="margin-bottom:0.5rem;"><strong style="color:#8892a8;font-size:11px;">${esc(s.name)}</strong></div>
          <div style="margin-bottom:0.5rem;">
            <strong style="color:#8892a8;">Evacuation Status:</strong><br/>
            <span style="color:${color};font-weight:700;font-size:13px;">${s.status}</span>
          </div>
          <div style="margin-bottom:0.5rem;font-size:11px;"><strong style="color:#8892a8;">Inside:</strong> ${s.layers.map(esc).join(', ')}</div>
          <div style="padding-top:0.5rem;border-top:1px solid var(--border);margin-top:0.5rem;font-size:10px;color:#8892a8;">${s.distance.toFixed(1)} km from vent${s.municipality ? ` • ${esc(s.municipality)}` : ''}</div>
        </div>
      </div>
    `, { maxWidth: 280, className: 'custom-popup' });
    marker.addTo(markerLayer);
    markers[s.key] = marker;
  }
  showMarkerLegend(schools.length > 0);
}

// Explains the school marker colors; shown only while there are markers.
function showMarkerLegend(show) {
  let legend = document.getElementById('map-legend');
  if (!legend) {
    legend = document.createElement('div');
    legend.id = 'map-legend';
    legend.className = 'map-legend';
    legend.innerHTML = `
      <div class="legend-title">🗺️ School Markers</div>
      <div class="legend-item"><div class="legend-dot" style="background-color:#ff4444;"></div><span style="color:#ff4444;">🏫 Critical</span></div>
      <div class="legend-item"><div class="legend-dot" style="background-color:#ff8c2a;"></div><span style="color:#ff8c2a;">🏫 Priority</span></div>
      <div class="legend-item"><div class="legend-dot" style="background-color:#ffc62a;"></div><span style="color:#ffc62a;">🏫 Moderate</span></div>`;
    document.getElementById('map').appendChild(legend);
  }
  legend.hidden = !show;
}

// ── School box ──────────────────────────────────────────────────────────────

// Listed under a zone, a school takes that zone's color.
function item(s, color) {
  const place = s.municipality ? ` • ${esc(s.municipality)}` : '';
  return `
    <div class="risk-school-item" data-key="${esc(s.key)}" style="border-left-color:${color}">
      <div style="color:var(--text);margin-bottom:0.1rem;">📚 ${esc(s.name)}</div>
      <div style="color:var(--text2);font-size:10px;">${esc(s.type)} • ${s.distance.toFixed(1)} km${place}</div>
    </div>`;
}

let shownSections = [];
// The coverage chip filtering the list: kept by title so it survives other
// layers being toggled, and as an index into shownSections for rendering.
let filterTitle = null;
let filterSection = null;

function sectionHtml(section, i) {
  return `
    <div class="risk-school-section">
      <div class="risk-school-section-title"><span class="hazard-swatch" style="background:${section.color}"></span>${esc(section.title)} • ${section.schools.length}</div>
      ${section.schools.slice(0, SCHOOLS_PER_SECTION).map(s => item(s, section.color)).join('')}
      ${section.schools.length > SCHOOLS_PER_SECTION
        ? `<button type="button" class="ash-show-more" data-section="${i}">Show all ${section.schools.length} schools</button>`
        : ''}
    </div>`;
}

function listHtml() {
  const shown = shownSections
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => s.schools.length && (filterSection === null || i === filterSection));
  return shown.map(({ s, i }) => sectionHtml(s, i)).join('')
    || '<div style="color:var(--text2);font-size:11px;text-align:center;">No schools</div>';
}

// One chip per zone with the number of schools it covers. The hazard and zone
// go on separate lines so a long hazard name can't hide which zone it is.
function chipsHtml() {
  return shownSections.map((s, i) => `
    <button type="button" class="ash-band-chip risk-coverage-chip ${i === filterSection ? 'active' : ''}" data-section="${i}"
      aria-pressed="${i === filterSection}" style="border-left-color:${s.color}" title="${esc(s.title)}" ${s.schools.length ? '' : 'disabled'}>
      <span>${esc(s.hazardLabel)}<br>${esc(s.zoneShort)}</span><strong>${s.schools.length}</strong>
    </button>`).join('');
}

function renderBox({ sections, schools }) {
  const el = document.getElementById('risk-zone-school-box');
  if (!el) return;
  shownSections = sections;
  const i = sections.findIndex(s => s.title === filterTitle && s.schools.length);
  filterSection = i === -1 ? null : i;
  if (filterSection === null) filterTitle = null;
  const layerNames = [];
  for (const h of state.activeHazards) {
    if (h.volcano === state.currentVolcano) layerNames.push(h.layer.label);
  }

  el.innerHTML = `
    <div style="border:2px solid rgba(255,107,53,0.6);border-radius:10px;padding:0.8rem;background:linear-gradient(135deg,rgba(255,107,53,0.1) 0%,rgba(255,107,53,0.05) 100%);display:flex;flex-direction:column;height:100%;">
      <div style="margin-bottom:0.6rem;border-bottom:2px solid rgba(255,107,53,0.4);padding-bottom:0.4rem;flex-shrink:0;">
        <div style="font-size:14px;font-weight:700;color:#ff8c2a;text-transform:uppercase;letter-spacing:0.3px;margin-bottom:0.15rem;">School Risk Assessment</div>
        <div style="font-size:9px;font-weight:600;color:#ff6b35;text-transform:uppercase;letter-spacing:0.2px;">${layerNames.length ? `${layerNames.map(esc).join(' + ')} • ${schools.length} Schools` : 'No hazard zones on'}</div>
      </div>
      ${layerNames.length ? `<div class="risk-coverage-chips">${chipsHtml()}</div>` : ''}
      <div class="risk-school-list" style="overflow-y:auto;flex:1;min-height:0;padding-right:0.3rem;border-top:1px solid rgba(255,107,53,0.3);padding-top:0.4rem;font-size:11px;">
        ${layerNames.length
          ? listHtml()
          : `<div style="color:var(--text2);font-size:11px;text-align:center;">${state.hazardMapsAvailable
            ? 'Turn on a hazard zone above the map to list the schools inside it'
            : `No hazard zone maps for ${esc(state.currentVolcano)} yet`}</div>`}
      </div>
    </div>`;
}

function initBoxClicks() {
  const el = document.getElementById('risk-zone-school-box');
  if (!el || el.dataset.bound) return;
  el.dataset.bound = '1';
  el.addEventListener('click', e => {
    // Chips filter the list to one zone; clicking the active chip shows all again.
    const chip = e.target.closest('.risk-coverage-chip');
    if (chip) {
      if (chip.disabled) return;
      const i = Number(chip.dataset.section);
      filterSection = filterSection === i ? null : i;
      filterTitle = filterSection === null ? null : shownSections[i].title;
      el.querySelectorAll('.risk-coverage-chip').forEach(c => {
        const on = Number(c.dataset.section) === filterSection;
        c.classList.toggle('active', on);
        c.setAttribute('aria-pressed', String(on));
      });
      const list = el.querySelector('.risk-school-list');
      list.innerHTML = listHtml();
      list.scrollTop = 0;
      return;
    }
    const more = e.target.closest('.ash-show-more');
    if (more) {
      const section = shownSections[more.dataset.section];
      more.outerHTML = section.schools.slice(SCHOOLS_PER_SECTION).map(s => item(s, section.color)).join('');
      return;
    }
    const row = e.target.closest('.risk-school-item');
    const marker = row && markers[row.dataset.key];
    if (!marker) return;
    state.map.flyTo(marker.getLatLng(), Math.max(state.map.getZoom(), 13), { duration: 0.8 });
    marker.openPopup();
  });
}

// Recomputes the list and markers from the current volcano, radius and hazard
// toggles. Called whenever any of those change, and once schools have loaded.
export function updateSchoolRisk() {
  if (!state.map) return;
  initBoxClicks();
  const result = assess();
  drawMarkers(result.schools);
  renderBox(result);
}
