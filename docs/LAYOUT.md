# Repository layout

[← README](../README.md) · [Architecture](ARCHITECTURE.md) · [Progress](PROGRESS.md)

```
.
├── frontend/              ← published to GitHub Pages
│   ├── index.html         shell (CDN libs + CSS + module entry)
│   ├── css/styles.css
│   ├── js/
│   │   ├── config.js            static constants (volcanoes, hazard layers, thresholds, feeds, news)
│   │   ├── state.js             shared mutable runtime state
│   │   ├── data.js              loads snapshot JSON from ./data/*.json
│   │   ├── schools.js           DepEd schools loader + distance queries
│   │   ├── charts.js            trend chart + radar chart (Chart.js)
│   │   ├── map.js               Risk Zones base map + volcano markers
│   │   ├── ash-deposit.js       Ash3d deposit map + schools per thickness band
│   │   ├── hazard-zones.js      hazard zone overlays (one per Drive folder) on the risk zone map
│   │   ├── school-risk.js       schools inside the switched-on hazard zones (list + markers)
│   │   ├── leaflet-tiles.js     removes white lines between map tiles (both maps)
│   │   ├── dashboard.js         top-level render (tabs, params)
│   │   ├── kanlaon-snapshot.js  Kanlaon camera feed + news panel
│   │   ├── lahar-chat.js        floating chat widget
│   │   └── main.js              entry point — wires DOMContentLoaded
│   └── data/
│       ├── deped_schools.json           (43,502 schools)
│       ├── kanlaon.json / mayon.json / taal.json   (produced by scripts)
│       ├── ash_deposits.json + ash/*.geojson       (produced by scripts)
│       └── hazard_zones.json + hazard/*.geojson    (produced by scripts)
├── scripts/
│   ├── sync-sheets.mjs    Node 20 script: Google Sheets API → JSON
│   ├── build-ash-deposits.mjs  Ash3d shapefiles (Google Drive) → GeoJSON
│   ├── build-hazard-zones.mjs  hazard zone shapefiles (Google Drive) → GeoJSON
│   ├── drive.mjs / shapefile.mjs  Drive listing and shapefile reading for both builders
│   ├── google-auth.mjs    service-account token for all scripts
│   ├── validate-data.mjs  sanity checks run before snapshots are committed
│   └── package.json
├── tests/
│   ├── smoke.mjs          headless browser check used by CI
│   └── package.json
├── docs/                  layout, architecture and progress notes
└── .github/workflows/
    ├── ci.yml             pull request: syntax check + browser smoke test
    ├── sync-data.yml      cron: daily sheet pull → validates → commits data/*.json
    ├── deploy-pages.yml   push: deploys frontend/ to GH Pages
    └── monitor.yml        cron: fails if the live data is stale
```
