import { state } from './state.js';
import { VOLCANO_META } from './config.js';
import './leaflet-tiles.js';

// Risk Zones map: base map and volcano markers. Hazard zones are drawn by
// hazard-zones.js and the schools inside them by school-risk.js.
export function initMap() {
  const { coords, zoomLevel } = VOLCANO_META[state.currentVolcano];
  state.map = L.map('map').setView(coords, zoomLevel);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap',
  }).addTo(state.map);
  state.markersLayer = L.layerGroup().addTo(state.map);
}

export function updateMapMarkers() {
  if (!state.markersLayer) return;
  state.markersLayer.clearLayers();
  for (const [vol, cfg] of Object.entries(VOLCANO_META)) {
    const marker = L.circleMarker(cfg.coords, {
      radius: vol === state.currentVolcano ? 8 : 6,
      fillColor: vol === state.currentVolcano ? '#ff6b35' : '#ff4444',
      color: vol === state.currentVolcano ? '#ff8c2a' : '#ff6b35',
      weight: vol === state.currentVolcano ? 3 : 2,
      opacity: 1,
      fillOpacity: 0.8,
      title: vol,
    });
    marker.bindPopup(`<strong>${vol}</strong><br>Elevation: ${cfg.elevation}<br>Type: ${cfg.type}`);
    marker.addTo(state.markersLayer);
  }
}
