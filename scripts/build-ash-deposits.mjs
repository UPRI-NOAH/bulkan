#!/usr/bin/env node
// Pulls USGS Ash3d deposit-thickness shapefiles from one private Google Drive
// folder per volcano and converts them to GeoJSON under frontend/data/ash/,
// plus a manifest (frontend/data/ash_deposits.json) the dashboard reads.
//
// Each folder may hold, per model run: a .zip from Ash3d, a subfolder with the
// depothik.* files, or the depothik.* files directly.
//
// Auth: GDRIVE_SA_KEY = the service account's JSON key (folders shared with it).
// Local testing: `node build-ash-deposits.mjs --local <dir>` reads
// <dir>/<Volcano>/ instead of Drive.
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getAccessToken } from './google-auth.mjs';
import { driveSource, localSource } from './drive.mjs';
import { ext, stem, unzip, readDbf, readShp as readShapes } from './shapefile.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'frontend', 'data');
const OUT_DIR = join(DATA_DIR, 'ash');
const MANIFEST = join(DATA_DIR, 'ash_deposits.json');

const DRIVE_FOLDERS = {
  Kanlaon: '1S_QKDfhzlo2fQkKH_gh7GMRJ_rL0j5IB',
  Mayon: '1GLK0Cz4tbzTE2sSLnRyrDMhUpTciFG80',
  Taal: '1pXxMZ_yP0mPqmAypCwRTey-O69YmWyad',
};

const DEPOSIT_VAR = 'Final Deposit Thickness';

// Ash3d isopachs are PolyLines in lon/lat.
function readShp(buf) {
  return readShapes(buf).map(rec => {
    if (!rec) return null;
    if (rec.kind !== 'line') throw new Error('shape type is not a PolyLine');
    const lines = rec.parts.map(part => part.map(([x, y]) => [+x.toFixed(6), +y.toFixed(6)]));
    return lines.length === 1
      ? { type: 'LineString', coordinates: lines[0] }
      : { type: 'MultiLineString', coordinates: lines };
  });
}

// ── Collecting shapefiles from a volcano folder ─────────────────────────────

// Pairs each .shp with its .dbf. Re-uploading depothik.* into the same folder
// gives duplicate names, so pick the .dbf uploaded closest in time.
function pairShapefiles(files) {
  const dbfs = files.filter(f => ext(f.name) === 'dbf');
  return files.filter(f => ext(f.name) === 'shp').map(shp => {
    const t = Date.parse(shp.createdTime);
    const dbf = dbfs
      .filter(d => stem(d.name) === stem(shp.name))
      .sort((a, b) => Math.abs(Date.parse(a.createdTime) - t) - Math.abs(Date.parse(b.createdTime) - t))[0];
    return { shp, dbf };
  });
}

async function collect(source, folderId, path) {
  const files = await source.list(folderId);
  const found = [];
  for (const { shp, dbf } of pairShapefiles(files)) {
    if (!dbf) { console.warn(`[skip] ${path}/${shp.name}: no matching .dbf`); continue; }
    found.push({
      origin: `${path}/${shp.name}`,
      shp: await source.download(shp),
      dbf: await source.download(dbf),
      fileTime: shp.modifiedTime || shp.createdTime,
    });
  }
  for (const zip of files.filter(f => ext(f.name) === 'zip')) {
    const entries = unzip(await source.download(zip));
    const names = Object.keys(entries).filter(n => !n.startsWith('__MACOSX'));
    for (const name of names.filter(n => ext(n) === 'shp')) {
      const dbf = names.find(n => ext(n) === 'dbf' && n.slice(0, -4).toLowerCase() === name.slice(0, -4).toLowerCase());
      if (!dbf) { console.warn(`[skip] ${path}/${zip.name}:${name}: no matching .dbf`); continue; }
      found.push({
        origin: `${path}/${zip.name}:${name}`,
        shp: entries[name].data,
        dbf: entries[dbf].data,
        fileTime: entries[name].mtime,
      });
    }
  }
  for (const sub of files.filter(f => f.isFolder)) {
    found.push(...await collect(source, sub.id, `${path}/${sub.name}`));
  }
  return found;
}

// ── Conversion ──────────────────────────────────────────────────────────────

const compactTime = iso => iso.replace(/[-:]/g, '').replace(/\.\d+/, '').replace(/00Z$/, 'Z');

const formatDate = iso => new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Manila',
}).format(new Date(iso));

// Brings both Ash3d shapefile layouts to the current one's attributes:
// - current: VOLC, VAR, VALUE, UNITS, INDEX, E_STIME, RUN DATE, ... per contour
// - older export (dp_mm.*): only name ("<Volcano>_Deposit_mm"), value, index;
//   no eruption or run times, so the run date falls back to the file timestamp.
function normalizeRows(rows, origin, fileTime) {
  const first = rows[0];
  if (!first) {
    console.warn(`[skip] ${origin}: .dbf has no records`);
    return null;
  }
  if ('VAR' in first) {
    if (first.VAR !== DEPOSIT_VAR) {
      console.warn(`[skip] ${origin}: VAR is "${first.VAR}", not "${DEPOSIT_VAR}"`);
      return null;
    }
    return rows;
  }
  const legacy = String(first.name ?? '').trim().match(/^(.+?)_Deposit_mm$/i);
  if (legacy && 'value' in first) {
    const ranked = [...new Set(rows.map(r => r.value))].sort((a, b) => a - b);
    return rows.map(r => ({
      VOLC: legacy[1].replace(/_/g, ' '),
      VAR: DEPOSIT_VAR,
      VALUE: r.value,
      UNITS: 'mm',
      INDEX: ranked.indexOf(r.value),
      'RUN DATE': fileTime,
    }));
  }
  console.warn(`[skip] ${origin}: not an Ash3d deposit thickness shapefile (columns: ${Object.keys(first).join(', ')})`);
  return null;
}

// Scheduled runs are named "<Volcano>-<MM>-<DD>-<YY>-<time>-<plume>KM"
// (e.g. "Kanlaon-11-03-26-8AM-5KM") on the zip, subfolder or shapefile. Older
// uploads don't follow it and stay standalone runs.
const SCENARIO_NAME = /([A-Za-z]+)-(\d{1,2})-(\d{1,2})-(\d{2}|\d{4})-(\d{1,2})\s*([AP]M)-(\d+(?:\.\d+)?)\s*KM/gi;

function parseScenario(volcano, origin) {
  const match = [...origin.matchAll(SCENARIO_NAME)].at(-1);
  if (!match) return null;
  const [, name, month, day, year, hour, ampm, plume] = match;
  if (name.toLowerCase() !== volcano.toLowerCase()) {
    console.warn(`[scenario] ${origin}: named for "${name}" but is in the ${volcano} folder; treating as a standalone run`);
    return null;
  }
  const date = `${year.length === 2 ? `20${year}` : year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  if (Number.isNaN(Date.parse(date))) {
    console.warn(`[scenario] ${origin}: "${match[0]}" has an invalid date; treating as a standalone run`);
    return null;
  }
  const set = `${volcano.toLowerCase()}_${date.replace(/-/g, '')}`;
  return {
    set,
    setTitle: `${volcano} ${formatDate(`${date}T12:00:00+08:00`)} Simulations`,
    date,
    time: `${Number(hour)}${ampm.toUpperCase()}`,
    plumeKm: Number(plume),
  };
}

function convert(volcano, { origin, shp, dbf, fileTime }) {
  const rows = normalizeRows(readDbf(dbf), origin, fileTime);
  if (!rows) return null;
  const first = rows[0];
  if (String(first.VOLC).trim().toLowerCase() !== volcano.toLowerCase()) {
    console.warn(`[skip] ${origin}: model is for "${first.VOLC}" but is in the ${volcano} folder`);
    return null;
  }
  const geoms = readShp(shp);
  if (geoms.length !== rows.length) throw new Error(`${origin}: ${geoms.length} shapes but ${rows.length} records`);

  const eruptionStart = first.E_STIME || null;
  const runDate = first['RUN DATE'];
  const scenario = parseScenario(volcano, origin);
  const id = scenario
    ? `${scenario.set}_${scenario.time.toLowerCase()}_${scenario.plumeKm}km`
    : `${volcano.toLowerCase()}_${eruptionStart ? `${compactTime(eruptionStart)}_` : ''}run${compactTime(runDate)}`;
  return {
    entry: {
      id,
      title: scenario
        ? `${volcano} ${formatDate(`${scenario.date}T12:00:00+08:00`)} · ${scenario.time} · ${scenario.plumeKm} km plume`
        : eruptionStart
          ? `${volcano} ${formatDate(eruptionStart)} Eruption`
          : `${volcano} Ash3d Model · ${formatDate(runDate)}`,
      eruptionStart,
      runDate,
      ...(scenario && { scenario }),
      url: `./data/ash/${id}.geojson`,
    },
    geojson: {
      type: 'FeatureCollection',
      features: geoms.map((geometry, i) => ({ type: 'Feature', properties: rows[i], geometry })),
    },
  };
}

async function main() {
  const localIdx = process.argv.indexOf('--local');
  const localDir = localIdx !== -1 ? process.argv[localIdx + 1] : null;
  const source = localDir
    ? localSource()
    : driveSource(await getAccessToken('https://www.googleapis.com/auth/drive.readonly'));

  // Convert everything in memory first so a Drive failure leaves the
  // previously published models untouched.
  const models = {};
  const outputs = [];
  for (const [volcano, folderId] of Object.entries(DRIVE_FOLDERS)) {
    const shapefiles = await collect(source, localDir ? join(localDir, volcano) : folderId, volcano);
    const list = (models[volcano] = []);
    for (const shapefile of shapefiles) {
      const result = convert(volcano, shapefile);
      if (!result) continue;
      if (list.some(m => m.id === result.entry.id)) {
        console.warn(`[dupe] ${shapefile.origin} is the same run as an earlier file; keeping the first`);
        continue;
      }
      list.push(result.entry);
      outputs.push(result);
      console.log(`[${volcano}] ${result.entry.title} (${result.geojson.features.length} isopachs) ← ${shapefile.origin}`);
    }
    // Newest first: scenario date, else eruption time, else run date. A
    // scenario set's runs stay together so the dashboard can group them.
    const when = m => m.scenario?.date || m.eruptionStart || m.runDate;
    list.sort((a, b) => when(b).localeCompare(when(a))
      || (a.scenario?.set || a.id).localeCompare(b.scenario?.set || b.id)
      || b.runDate.localeCompare(a.runDate));
    const setSizes = {};
    for (const m of list) if (m.scenario) setSizes[m.scenario.set] = (setSizes[m.scenario.set] || 0) + 1;
    for (const [set, n] of Object.entries(setSizes)) {
      if (n < 10) console.warn(`[scenario] ${set}: ${n} of 10 scenarios found`);
    }
  }

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  for (const { entry, geojson } of outputs) {
    await writeFile(join(OUT_DIR, `${entry.id}.geojson`), JSON.stringify(geojson));
  }
  await writeFile(MANIFEST, JSON.stringify({ models }, null, 2) + '\n');
  console.log(`wrote ${outputs.length} model(s) → ${MANIFEST}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
