# Architecture

[← README](../README.md) · [Layout](LAYOUT.md) · [Progress](PROGRESS.md)

The site is static: `frontend/` is served as-is from GitHub Pages and reads JSON/GeoJSON snapshots from `frontend/data/`. Node scripts in `scripts/` produce those snapshots from Google Sheets and Google Drive, and GitHub Actions run them, validate the output, commit it and redeploy.

```
Google Sheets ──sync-sheets.mjs──────────► data/{kanlaon,mayon,taal}.json ─┐
Drive (Ash3d) ──build-ash-deposits.mjs───► data/ash_deposits.json + ash/   ├─► GitHub Pages ─► browser
Drive (zones) ──build-hazard-zones.mjs───► data/hazard_zones.json + hazard/┘
                 (manual, not in daily sync)
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

### Ash deposit build

```bash
cd scripts
GDRIVE_SA_KEY="$(cat path/to/key.json)" npm run ash
# or, without Drive, from a local folder laid out as <dir>/Kanlaon, <dir>/Mayon, <dir>/Taal:
node build-ash-deposits.mjs --local <dir>
# writes frontend/data/ash/*.geojson and frontend/data/ash_deposits.json
```

The daily sync runs this too. If Drive can't be read, the last published models stay up.

### Hazard zone build

Zones change rarely, so they are **not** rebuilt by the daily sync. After new shapefiles are uploaded, rebuild locally and commit the output through a pull request; merging it to `main` redeploys the site:

```bash
cd scripts
GDRIVE_SA_KEY="$(cat path/to/key.json)" npm run hazard
# or from a local folder laid out as <dir>/<Volcano>/<hazard folder>/:
node build-hazard-zones.mjs --local <dir>
# writes frontend/data/hazard/*.geojson and frontend/data/hazard_zones.json
```

Check the log for skipped files and `git diff --stat frontend/data/hazard` before committing. If Drive can't be read the script stops without touching the published files.

- Shapefiles in anything other than Web Mercator or WGS84 lon/lat fail the build with a message naming the file.
- Outlines are simplified to about 5 m so the page stays light.
- If two files name the same zone, the newer one is used and the log says so.
- To add another volcano, create the same folder layout, share it with the service account, add its folder ID to `DRIVE_FOLDERS` in `scripts/build-hazard-zones.mjs`, and list its hazards in the README's volcano table.

**Colors and ids.** Colors are in `HAZARD_COLORS` in `frontend/js/config.js`, keyed by the hazard id the build makes from the folder name (lowercase, words joined by `-`: `Base Surge (Pyroclastic)` → `base-surge-pyroclastic`). Each hazard has a dark-to-light set of shades, spread over its zones by severity. A new hazard without an entry still shows, with a fallback color; add an entry to pick its color. Renaming a folder changes its id, so update the entry too. Zone labels and statuses are in `HAZARD_ZONES`.

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

## Map tile lines

Both maps (Risk Zones and the ash deposit map) import `frontend/js/leaflet-tiles.js`, which removes thin white lines that otherwise run along the edges of the OpenStreetMap tiles.

- **When the lines appear:** only when the screen or browser zoom is not a whole-number scale, such as 125% or 150% (common on Windows laptops). They don't appear at 100% or on Retina screens.
- **Why:** at those scales tile edges fall between screen pixels. Leaflet 1.9 draws tiles with `mix-blend-mode: plus-lighter`, which adds together the colours of tiles sharing an edge pixel, so light areas turn white. Where tiles fall short of each other, a gap shows instead.
- **Fix:** each tile is drawn 1px larger so neighbours overlap, with normal blending so the top tile covers the one under it. Both parts are needed: with the overlap alone, the overlapping strip turns white.
- **Scope:** it changes only how map tiles are created. Hazard zones, ash contours, markers and legends are drawn separately and aren't affected.

It works by wrapping Leaflet's internal `GridLayer._initTile`, not a documented option. That is safe while `index.html` pins Leaflet 1.9.4. After upgrading Leaflet, check the maps at 125% browser zoom (Cmd/Ctrl +) and remove the file if the new version fixes the lines itself.
