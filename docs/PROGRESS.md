# Progress

[← README](../README.md) · [Layout](LAYOUT.md) · [Architecture](ARCHITECTURE.md)

## Known gaps

- **Kanlaon** has no columns mapped for `VolcanicTremors`, `Rockfall`, or `PDCEvents`, so those stay empty. If the sheet gains them, update `COLUMN_INDICES_KANLAON` in `scripts/sync-sheets.mjs`.
- **Taal** has no columns mapped for `Rockfall` or `PDCEvents`, so those stay empty. Its sheet has no PDC data.

## Milestones

PR numbers before 2026-11-23 refer to the original repo, `lebcstr/bulkan`.

| Date | Change | PR |
|---|---|---|
| 2026-11-23 | Repo moved to `UPRI-NOAH/bulkan`; site now at upri-noah.github.io/bulkan | UPRI-NOAH/bulkan#1 |
| 2026-11-20 | Taal hazard zones (Ballistics, Base Surge, Fissure); hazards named after their Drive folders; AM/PM ashfall labels | lebcstr/bulkan `feat/taal-hazard-zones` |
| 2026-11-18 | Hard-coded risk radii replaced by Lahar / PDC / Lava Flow hazard zone maps, with school risk per zone | lebcstr/bulkan#10 |
| 2026-11-09 | Data validation before commit, 6-hourly freshness monitor, PR checks (syntax + browser smoke test) | lebcstr/bulkan#9 |
| 2026-11-05 | Responsive mobile/tablet layout; larger ash controls and risk zone panels | lebcstr/bulkan#6, lebcstr/bulkan#7, lebcstr/bulkan#8 |
| 2026-11-05 | Ash3d scheduled simulation scenarios with calendar and Time / Plume height toggles | lebcstr/bulkan#5 |
| 2026-10-30 | Sheets read via the Sheets API with a service account; ash panel moved above feeds | lebcstr/bulkan#4 |
| 2026-10-24 | Ash3d deposit models built automatically from Google Drive; older exports supported | lebcstr/bulkan#2, lebcstr/bulkan#3 |
| 2026-10-23 | Ash3d deposit map with affected schools per thickness band | — |
| 2026-10-21 | STA/LTA bars, threshold flags and eruption markers on the trend chart | lebcstr/bulkan#1 |
| 2026-10-19 | Initial modular dashboard; daily sheet sync at 09:00 PH | — |
