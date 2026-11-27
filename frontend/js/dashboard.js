import { state } from './state.js';
import { VOLCANO_META } from './config.js';
import { STALTA_THRESHOLD, isRecorded } from './charts.js';
import { updateTrendChart, updateRadarChart, updateNavigationButtons } from './charts.js';
import { updateMapMarkers } from './map.js';
import { updateLiveFeeds } from './kanlaon-snapshot.js';
import { updateAshDeposit } from './ash-deposit.js';
import { updateHazardZones } from './hazard-zones.js';

export function render() {
  renderTabs();
  renderParams();
  updateMapMarkers();
  updateRadarChart();
  updateTrendChart();
  updateNavigationButtons();
}

function renderTabs() {
  const html = Object.keys(VOLCANO_META).map(vol => {
    const data = state.dashboardData[vol] || [];
    let level = 1;
    let date = 'N/A';
    let stalta = NaN;
    if (data.length > 0) {
      const latest = data[data.length - 1];
      if (latest.AlertLevel) level = Math.round(parseFloat(latest.AlertLevel)) || 1;
      date = (latest.DATE || 'N/A').toString().substring(0, 10);
      stalta = parseFloat(latest.STALTA);
    }
    const staltaExceeded = stalta > STALTA_THRESHOLD;
    const levelClass = level === 1 ? 'level-1' : level === 2 ? 'level-2' : 'level-3';
    const isActive = vol === state.currentVolcano ? 'active' : '';
    const staltaClass = staltaExceeded ? 'stalta-alert' : '';
    const staltaWarning = staltaExceeded
      ? `<div class="stalta-warning">STA/LTA &gt; ${STALTA_THRESHOLD.toFixed(1)}: possible eruption within 7–14 days</div>`
      : '';
    return `
      <div class="vtab ${isActive} ${staltaClass}" onclick="selectVol('${vol}')" style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem">
        <div style="flex:1">
          <h3 style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem">
            <span style="font-size:20px">🌋</span>
            ${vol} Volcano
          </h3>
          <p>${VOLCANO_META[vol].elevation} • ${VOLCANO_META[vol].type}</p>
          <p style="color:var(--text3);margin-top:0.3rem">As of: ${date}</p>
          ${staltaWarning}
        </div>
        <div class="alert-badge ${levelClass}">${level}</div>
      </div>`;
  }).join('');
  document.getElementById('volcano-tabs').innerHTML = html;
}

function renderParams() {
  const data = state.dashboardData[state.currentVolcano] || [];
  const container = document.getElementById('param-list');

  if (data.length === 0) {
    container.innerHTML = '<div class="loading">No data</div>';
    return;
  }

  const latest = data[data.length - 1];

  const params = [
    { key: 'VEQ', label: 'VEQ', unit: 'events/day' },
    { key: 'VolcanicTremors', label: 'Volcanic Tremors', unit: 'events/day' },
    { key: 'Rockfall', label: 'Rockfall', unit: 'events/day' },
    { key: 'PDCEvents', label: 'PDC Events', unit: 'events/day' },
    { key: 'SO2Flux', label: 'SO₂ Flux', unit: 'tons/day' },
    { key: 'PlumeHeight', label: 'Plume Height', unit: 'm' },
    { key: 'STALTA', label: 'STA/LTA', unit: 'ratio' },
  ];

  const blank = v => v === null || v === undefined || v === '' || v === 'None' || v === 'none';

  let html = '';
  let found = 0;

  // A parameter is listed when the volcano has ever reported it, so a zero
  // reading shows as 0 and a day without a report shows as —.
  for (const p of params) {
    if (!isRecorded(state.currentVolcano, p.key)) continue;
    const val = latest[p.key];
    let display = '—';
    if (!blank(val)) {
      const num = parseFloat(val);
      display = isNaN(num) ? val : Math.round(num * 100) / 100;
    }
    html += `
      <div class="param-item">
        <div>
          <div style="font-size:14px;color:var(--text2);text-transform:uppercase">${p.label}</div>
          <div style="font-size:12px;color:var(--text3);margin-top:0.2rem">${p.unit}</div>
        </div>
        <div class="param-value">${display}</div>
      </div>`;
    found++;
  }
  container.innerHTML = found === 0 ? '<div class="error">⚠️ No active parameters</div>' : html;
  capParamList(container);
}

// The panel keeps its four-parameter height; more parameters scroll.
const PARAMS_VISIBLE = 4;
function capParamList(container) {
  container.style.maxHeight = '';
  container.classList.remove('scrollable');
  const items = container.querySelectorAll('.param-item');
  if (items.length <= PARAMS_VISIBLE) return;
  const padBottom = parseFloat(getComputedStyle(container).paddingBottom);
  const height = items[PARAMS_VISIBLE].getBoundingClientRect().top - container.getBoundingClientRect().top + padBottom;
  if (height <= padBottom) return; // not laid out (panel hidden)
  container.style.maxHeight = `${height}px`;
  container.classList.add('scrollable');
}
window.addEventListener('resize', () => {
  const container = document.getElementById('param-list');
  if (container) capParamList(container);
});

export function selectVol(vol) {
  state.currentVolcano = vol;
  render();
  if (state.map) {
    const cfg = VOLCANO_META[vol];
    state.map.setView(cfg.coords, cfg.zoomLevel);
    updateHazardZones();
  }
  updateLiveFeeds();
  updateAshDeposit();
}
