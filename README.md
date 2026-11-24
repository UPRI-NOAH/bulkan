# Bulkan — Volcano Impact Risk Model (UP-NOAH)

https://upri-noah.github.io/bulkan/

Static dashboard that shows PHIVOLCS-style monitoring data (VEQ, Rockfall, PDC, SO₂, Plume), hazard zone maps (Lahar, PDC, Lava Flow, Ballistics, …) with the DepEd schools inside them, and a small chat helper.

Volcano data refreshes once a day at about 09:00 PH time.

**Developer docs:** [Layout](docs/LAYOUT.md) · [Architecture, build and deploy](docs/ARCHITECTURE.md) · [Progress and known gaps](docs/PROGRESS.md)

## Ash deposit models (USGS Ash3d)

The **Ash Deposit Model** panel shows Ash3d final deposit thickness isopachs and the DepEd schools inside each thickness band.

- The newest date is shown by default. Pick another from the 📅 calendar in the panel header; days without a simulation are struck through.
- For scheduled simulations, use the **Time** and **Plume height** toggles above the map. Missing scenarios are greyed out. The chosen time and plume height stay selected when you switch date or volcano.
- A day with several runs that don't follow the naming below gets a **Run** toggle.

### Publishing a new model

Upload the Ash3d deposit shapefile to the volcano's Google Drive folder, as the downloaded `.zip`, a subfolder with the `depothik.*` files, or the `depothik.*` files directly.

The daily **Sync Sheets Data** workflow (09:00 PH time) picks it up and redeploys. To publish immediately, run that workflow from the GitHub Actions tab.

- **Scheduled simulations:** name each run's `.zip`, subfolder or shapefile `<Volcano>-<MM>-<DD>-<YY>-<time>-<plume>KM`, e.g. `Kanlaon-11-03-26-8AM-5KM`. One date's runs (8AM and 8PM × 2, 3, 4, 5, 6 km) appear as one day in the calendar. A set that's missing some scenarios still shows, and the workflow log warns `N of 10 scenarios found`.
- Files that don't follow that naming are listed on their own: volcano, eruption time and run date are read from the shapefile itself.
- Older Ash3d exports (`dp_mm.*`, columns `name`/`value`/`index` only) also work. They carry no eruption parameters, so the run date comes from the file timestamp and the model is titled "<Volcano> Ash3d Model · <date>".
- A model whose volcano doesn't match its folder is skipped (see the workflow log).
- Deleting a file from Drive removes that model on the next run.

The folders are private; share any new folder with the service account (see [Google access](docs/ARCHITECTURE.md#google-access)).

## Hazard zones

The **Risk Zones** panel shows hazard zone maps. Each volcano's hazards come from its Drive folders, so the **Hazard zones** toggles above the map change with the volcano:

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

Each volcano has one Drive folder, inside the shared **Hazard Zones** folder, with **one subfolder per hazard**. The subfolder's name is the hazard's name on the site, so a new hazard is added just by creating a folder for it. A subfolder with no zone shapefiles (e.g. Kanlaon's empty `Composite Lahar and PDC`) is skipped.

Upload one polygon shapefile per zone into its hazard's subfolder, as a `.zip` or as the loose files (`.shp` and `.prj` are required). The **file name must contain exactly one zone word** from the table above, e.g. `KV_Lahar_High.zip`, `PDC_Buffer.zip`, `TV_Ballistics_Haz.shp`. Attribute columns aren't used.

- Shapefiles must be in **Web Mercator** (the ArcGIS default) or **WGS84 lon/lat**. Reproject anything else (e.g. UTM 51N) first.
- Re-uploading a zone replaces it.

Zones are **not** picked up by the daily sync. After uploading, the zones have to be rebuilt and redeployed; see [Hazard zone build](docs/ARCHITECTURE.md#hazard-zone-build).
