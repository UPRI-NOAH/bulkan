import { state } from './state.js';
import { VOLCANO_SNAPSHOT_FILES } from './config.js';

function makeMock() {
  const base = [
    { DATE: new Date().toISOString().split('T')[0], AlertLevel: 'Alert Level 2', VEQ: 12, VolcanicTremors: 45, Rockfall: 8, PDCEvents: 2, SO2Flux: 1200, PlumeHeight: 800 },
    { DATE: new Date(Date.now() - 86400000).toISOString().split('T')[0], AlertLevel: 'Alert Level 2', VEQ: 10, VolcanicTremors: 38, Rockfall: 6, PDCEvents: 1, SO2Flux: 1100, PlumeHeight: 750 },
    { DATE: new Date(Date.now() - 172800000).toISOString().split('T')[0], AlertLevel: 'Alert Level 1', VEQ: 8, VolcanicTremors: 32, Rockfall: 5, PDCEvents: 1, SO2Flux: 950, PlumeHeight: 650 },
    { DATE: new Date(Date.now() - 259200000).toISOString().split('T')[0], AlertLevel: 'Alert Level 1', VEQ: 6, VolcanicTremors: 28, Rockfall: 4, PDCEvents: 0, SO2Flux: 850, PlumeHeight: 600 },
    { DATE: new Date(Date.now() - 345600000).toISOString().split('T')[0], AlertLevel: 'Alert Level 1', VEQ: 5, VolcanicTremors: 22, Rockfall: 3, PDCEvents: 0, SO2Flux: 750, PlumeHeight: 550 },
  ];
  return base;
}

export function initializeMockData() {
  const mock = makeMock();
  state.dashboardData.Kanlaon = mock;
  state.dashboardData.Mayon = mock.map(d => ({ ...d, VEQ: d.VEQ + 2, SO2Flux: d.SO2Flux + 200 }));
  state.dashboardData.Taal = mock.map(d => ({ ...d, VEQ: d.VEQ - 1, Rockfall: d.Rockfall + 2, SO2Flux: d.SO2Flux - 100 }));
}

async function loadOne(volcano, url) {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    if (Array.isArray(payload.records) && payload.records.length > 0) {
      state.dashboardData[volcano] = payload.records;
      return { volcano, count: payload.records.length, syncedAt: payload.syncedAt };
    }
    throw new Error('empty records');
  } catch (e) {
    console.warn(`[data] ${volcano} snapshot unavailable (${e.message}) — keeping existing data`);
    return null;
  }
}

export async function loadVolcanoData() {
  const results = await Promise.all(
    Object.entries(VOLCANO_SNAPSHOT_FILES).map(([v, url]) => loadOne(v, url))
  );
  return results.filter(Boolean);
}
