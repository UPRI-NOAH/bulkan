# Local Copy of Bulkan — Volcano Impact Risk Model (UP-NOAH)

https://lebcstr.github.io/bulkan/

Static dashboard that shows PHIVOLCS-style monitoring data (VEQ, Rockfall, PDC, SO₂, Plume), hazard zone maps (Lahar, PDC, Lava Flow, Ballistics, …) with the DepEd schools inside them, and a small chat helper.

## Layout

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
│       ├── hazard_zones.json + hazard/*.geojson    (produced by scripts)
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
└── .github/workflows/
    ├── ci.yml             pull request: syntax check + browser smoke test
    ├── sync-data.yml      cron: daily sheet pull → validates → commits data/*.json
    ├── deploy-pages.yml   push: deploys frontend/ to GH Pages
    └── monitor.yml        cron: fails if the live data is stale
```

## Run locally

Serve `frontend/` over HTTP (ES modules need HTTP, not `file://`):

```bash
cd frontend
python3 -m http.server 8082
# → http://localhost:8082/
```

## Refresh data manually

The scripts need the service account's JSON key in `GDRIVE_SA_KEY` (see [Google access](#google-access)). Run them from `scripts/`, where `package.json` lives.

```bash
cd scripts
GDRIVE_SA_KEY="$(cat path/to/key.json)" npm run sync
# writes frontend/data/{kanlaon,mayon,taal}.json
```

PowerShell:

```powershell
cd scripts
$env:GDRIVE_SA_KEY = Get-Content path\to\key.json -Raw
npm run sync
```

This overwrites the committed snapshots, so check `git diff` before committing. Keep the key file outside the repo.

## Deploy to GitHub Pages

1. Push to a GitHub repo (`main` branch).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The `deploy-pages.yml` workflow publishes `frontend/` on every push to `main` and after a successful data sync.
4. The `sync-data.yml` workflow runs daily at 01:00 UTC (09:00 PH time, ~30 min after the source sheets refresh) and commits refreshed snapshots. You can trigger it manually from the Actions tab. It needs the `GDRIVE_SA_KEY` repository secret.

## Checks and monitoring

| Check | Runs | Fails when | Effect |
|---|---|---|---|
| **CI** (`ci.yml`) | Every pull request into `main` | A script has a syntax error, the site throws a JS error on load, or a local file is missing | Red X on the PR; merging is not blocked |
| **Data validation** (`npm run validate`) | Daily sync, before the commit | A volcano has no records, loses more than 10% of its records, or has a `DATE` that can't be parsed | Nothing is committed, so the last good snapshots stay live |
| **Freshness monitor** (`monitor.yml`) | Every 6 hours | The site is unreachable, or a volcano's `syncedAt` is more than 30 hours old | The workflow fails and GitHub sends a failure email |

Run the smoke test locally:

```bash
python3 -m http.server 8082 -d frontend &
cd tests
npm ci
npx playwright install chromium
node smoke.mjs
```

Validation covers the three volcano snapshots only. A failed ash or hazard zone build shows as a failed step in the sync log and keeps the last published models and zones.

The monitor checks GitHub Pages by default. If the site moves, set the `SITE_URL` repository variable (**Settings → Secrets and variables → Actions → Variables**) to the new address, without a trailing slash.

GitHub starts scheduled workflows late: from 25 Oct to 8 Nov 2026 the 09:00 PH sync actually started between about 13:50 and 15:50 PH. The 30-hour limit allows for that. On a host whose timers run on schedule, set the `MAX_AGE_HOURS` repository variable to `26` for earlier alerts.

## Ash deposit models (USGS Ash3d)

The **Ash Deposit Model** panel shows Ash3d final deposit thickness isopachs and the DepEd schools inside each thickness band.

### Publishing a new model

Upload the Ash3d deposit shapefile to the volcano's Google Drive folder, as the downloaded `.zip`, a subfolder with the `depothik.*` files, or the `depothik.*` files directly

The daily **Sync Sheets Data** workflow (09:00 PH time) picks it up and redeploys. To publish immediately, run that workflow from the Actions tab.

- **Scheduled simulations:** name each run's `.zip`, subfolder or shapefile `<Volcano>-<MM>-<DD>-<YY>-<time>-<plume>KM`, e.g. `Kanlaon-11-03-26-8AM-5KM`. One date's runs (8AM and 8PM × 2, 3, 4, 5, 6 km) appear as one day in the panel's calendar, with **Time** and **Plume height** toggles above the map. A set that's missing some scenarios still shows; missing ones are greyed out, and the workflow log warns `N of 10 scenarios found`. The chosen time and plume height stay selected when you switch date or volcano.
- Files that don't follow that naming are listed on their own as before: volcano, eruption time and run date are read from the shapefile itself.
- Older Ash3d exports (`dp_mm.*`, columns `name`/`value`/`index` only) also work. They carry no eruption parameters, so the run date comes from the file timestamp and the model is titled "<Volcano> Ash3d Model · <date>".
- A model whose volcano doesn't match its folder is skipped (see the workflow log).
- The newest date is shown by default. Pick another from the 📅 calendar in the panel header; days without a simulation are struck through. A day with several runs that don't follow the naming gets a **Run** toggle.
- Deleting a file from Drive removes that model on the next run. If Drive can't be read, the last published models stay up.

The folders are private and read with the service account (see [Google access](#google-access)).

### Run locally

```bash
cd scripts
GDRIVE_SA_KEY="$(cat path/to/key.json)" npm run ash
# or, without Drive, from a local folder laid out as <dir>/Kanlaon, <dir>/Mayon, <dir>/Taal:
node build-ash-deposits.mjs --local <dir>
# writes frontend/data/ash/*.geojson and frontend/data/ash_deposits.json
```

## Hazard zones

The **Risk Zones** panel shows only hazard zone maps. Each volcano's hazards come from its Drive folders, so the **Hazard zones** toggles above the map change with the volcano:

| Volcano | Hazards (folder names) |
|---|---|
| Kanlaon | Lahar, Lava Flow, PDC |
| Mayon | Lahar, Lava Flow, Pyroclastic Flow |
| Taal | Ballistics, Base Surge (Pyroclastic), Fissure |

Each hazard's zones (e.g. Lahar High) can be hidden or shown individually from the map legend. A hazard that is on stays on when you switch to another volcano with a folder of the same name (e.g. Lahar).

The **School Risk Assessment** lists the DepEd schools inside the zones that are on, one section per zone, with a coverage chip per zone that filters the list. A school inside nested zones of one hazard is listed under the most severe of them. Its marker color is its worst status across the zones it is in.

Zones come from the file names. These are the zone words, most to least severe, with the school status each gives:

| Zone | File name word | Status |
|---|---|---|
| High hazard | `high` | Critical |
| Hazard zone | `haz` or `hazard` | Critical |
| Medium hazard | `medium`, `med` or `moderate` | Priority |
| Buffer zone (dashed) | `buffer` | Priority |
| Low hazard | `low` | Moderate |

Graded maps use high/medium/low (Lahar). Ungraded maps use haz, optionally with a buffer (PDC, Base Surge).

### Publishing zones

Each volcano has one Drive folder, inside the shared **Hazard Zones** folder, with **one subfolder per hazard**. The subfolder's name is the hazard's name on the site, so a new hazard is added just by creating a folder for it. A subfolder with no zone shapefiles (e.g. Kanlaon's empty `Composite Lahar and PDC`) is skipped and the log says so.

Upload one polygon shapefile per zone into its hazard's subfolder, as a `.zip` or as the loose files (`.shp` and `.prj` are required). The **file name must contain exactly one zone word** from the table above, e.g. `KV_Lahar_High.zip`, `PDC_Buffer.zip`, `TV_Ballistics_Haz.shp`. Attribute columns aren't used.

- Shapefiles must be in **Web Mercator** (the ArcGIS default) or **WGS84 lon/lat**. Anything else (e.g. UTM 51N) fails the build with a message naming the file; reproject it first.
- Outlines are simplified to about 5 m so the page stays light.
- Re-uploading a zone replaces it: if two files name the same zone, the newer one is used and the log says so.

Zones change rarely, so they are **not** rebuilt by the daily sync. After uploading, rebuild them locally and commit the output through a pull request; merging it to `main` redeploys the site:

```bash
cd scripts
GDRIVE_SA_KEY="$(cat path/to/key.json)" npm run hazard
# or from a local folder laid out as <dir>/<Volcano>/<hazard folder>/:
node build-hazard-zones.mjs --local <dir>
# writes frontend/data/hazard/*.geojson and frontend/data/hazard_zones.json
```

Check the log for skipped files and `git diff --stat frontend/data/hazard` before committing. If Drive can't be read the script stops without touching the published files.

To add another volcano, create the same folder layout, share it with the service account, and add its folder ID to `DRIVE_FOLDERS` in `scripts/build-hazard-zones.mjs`, then list its hazards in the volcano table above.

Colors are in `HAZARD_COLORS` in `frontend/js/config.js`, keyed by the hazard id the build makes from the folder name (lowercase, words joined by `-`: `Base Surge (Pyroclastic)` → `base-surge-pyroclastic`). Each hazard has a dark-to-light set of shades, spread over its zones by severity. A new hazard without an entry still shows, with a fallback color; add an entry to pick its color. Renaming a folder changes its id, so update the entry too. Zone labels and statuses are in `HAZARD_ZONES`.

## Map tile lines

Both maps (Risk Zones and the ash deposit map) import `frontend/js/leaflet-tiles.js`, which removes thin white lines that otherwise run along the edges of the OpenStreetMap tiles.

- **When the lines appear:** only when the screen or browser zoom is not a whole-number scale, such as 125% or 150% (common on Windows laptops). They don't appear at 100% or on Retina screens.
- **Why:** at those scales tile edges fall between screen pixels. Leaflet 1.9 draws tiles with `mix-blend-mode: plus-lighter`, which adds together the colours of tiles sharing an edge pixel, so light areas turn white. Where tiles fall short of each other, a gap shows instead.
- **Fix:** each tile is drawn 1px larger so neighbours overlap, with normal blending so the top tile covers the one under it. Both parts are needed: with the overlap alone, the overlapping strip turns white.
- **Scope:** it changes only how map tiles are created. Hazard zones, ash contours, markers and legends are drawn separately and aren't affected.

It works by wrapping Leaflet's internal `GridLayer._initTile`, not a documented option. That is safe while `index.html` pins Leaflet 1.9.4. After upgrading Leaflet, check the maps at 125% browser zoom (Cmd/Ctrl +) and remove the file if the new version fixes the lines itself.

## Data sources

Volcano records come from the automated monitoring Google Sheets, read with the Sheets API v4 as the service account. The sheets stay private; they only need to be shared (Viewer) with the service account.

Columns are mapped **by position**, so inserting or reordering a column in a sheet shifts the data. Row 1 is the header and is skipped.

- Dates may be real date cells or text; date cells are written as `YYYY-MM-DD`.
- A day is flagged `eruption: 1` when its Eruption cell contains the word "eruption".
- Fields with no column (–) are written as empty strings.

To change a source or a column, edit `VOLCANO_SOURCES` / `COLUMN_INDICES_*` in `scripts/sync-sheets.mjs`.

## Google access

All scripts authenticate as one Google Cloud service account. Its JSON key is the repository secret `GDRIVE_SA_KEY`, and the same value is used locally.

- **Sharing:** share each sheet and each Ash3d and hazard zone Drive folder with the service account's `client_email` (Viewer).
- **APIs:** the **Google Sheets API** and **Google Drive API** must both be enabled in the service account's project.
- **Native Sheets only:** an uploaded `.xlsx` can't be read by the Sheets API; convert it with *File → Save as Google Sheets*.
- **Cost:** both APIs are free; usage (a few requests a day) is far below quota.
- **Rotating the key:** create a new key on the service account, replace the secret, then delete the old key.

Common errors:

| Error | Cause |
|---|---|
| `GDRIVE_SA_KEY is not set` | env variable / secret missing |
| `403 … has not been used in project` | Sheets or Drive API not enabled |
| `403 The caller does not have permission` | file not shared with the service account |
| `400 This operation is not supported for this document` | file is an `.xlsx`, not a Google Sheet |

## Known gaps

- **Kanlaon** has no columns mapped for `VolcanicTremors`, `Rockfall`, or `PDCEvents`, so those stay empty. If the sheet gains them, update `COLUMN_INDICES_KANLAON`.
- **Taal** has no columns mapped for `Rockfall` or `PDCEvents`, so those stay empty. Its sheet has no PDC data.
- **Two legacy HTML files** (`Bulkan Latest.html`, `Volcano Embed HTML.html`) still live at the repo root. They are the pre-split monoliths — keep them for reference or move to an `archive/` folder.
