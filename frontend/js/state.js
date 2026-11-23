export const state = {
  dashboardData: { Kanlaon: [], Mayon: [], Taal: [] },
  currentVolcano: 'Mayon',
  currentTimeRange: 'daily',
  currentParameter: 'all',
  currentPeriodIndex: 0,
  // Hazards drawn on the risk zone map: { id, volcano, geojson, zones }.
  activeHazards: [],
  hazardMapsAvailable: false,
  allDepEdSchools: [],
  map: null,
  markersLayer: null,
  trendChart: null,
  radarChart: null,
  kanlaonSnapshotUrl: null,
  kanlaonLastCheckTime: 0,
};
