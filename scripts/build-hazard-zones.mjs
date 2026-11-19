#!/usr/bin/env node
// Pulls hazard-zone polygon shapefiles (Lahar, PDC, Lava Flow) from one
// private Google Drive folder per volcano and converts them to GeoJSON under
// frontend/data/hazard/, plus a manifest (frontend/data/hazard_zones.json).
//
// Folder layout: <volcano folder>/<Lahar|PDC|Lava Flow>/<one shapefile per zone>,
// each as a .zip or as loose .shp/.dbf/.prj files (or in a subfolder). The zone
// comes from the file name, e.g. KV_Lahar_High.zip, PDC_Buffer.zip. Other
// subfolders of the volcano folder are ignored.
//
// Auth: GDRIVE_SA_KEY = the service account's JSON key (folders shared with it).
// Local testing: `node build-hazard-zones.mjs --local <dir>` reads
// <dir>/<Volcano>/ instead of Drive.
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getAccessToken } from './google-auth.mjs';
import { driveSource, localSource } from './drive.mjs';
import { ext, stem, unzip, readShp } from './shapefile.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'frontend', 'data');
const OUT_DIR = join(DATA_DIR, 'hazard');
const MANIFEST = join(DATA_DIR, 'hazard_zones.json');

const DRIVE_FOLDERS = {
  Kanlaon: '1JjvBRXwMra1zC1kRUF6U978fun0J1iQF',
  Mayon: '1cXaYpfmsBSLBLHxfIjXS22EwTNut7IEj',
  Taal: '1I_VWjTwNsIIn9dTlEHLRTDvK-n0WF7c5',
};

// Hazard id → the subfolder names it is read from and its zones, most to least
// severe. Aliases are other words accepted for a zone in file names. A volcano
// whose map has one ungraded lava zone (Mayon) uses `haz`; graded maps
// (Kanlaon) use `high` and `low`.
const HAZARDS = {
  lahar: { folders: ['lahar'], zones: ['high', 'medium', 'low'] },
  pdc: { folders: ['pdc', 'pyroclasticflow'], zones: ['haz', 'buffer'] },
  lava: { folders: ['lavaflow'], zones: ['haz', 'high', 'low'], sets: [['haz'], ['high', 'low']] },
};
const ZONE_ALIASES = { haz: ['hazard'], medium: ['moderate', 'med'] };

// Vertices closer than this to the simplified outline are dropped.
const SIMPLIFY_M = 5;

const folderKey = name => name.toLowerCase().replace(/[^a-z0-9]/g, '');

// ── Collecting shapefiles ───────────────────────────────────────────────────

// Every .shp with its .prj under a hazard folder, from zips, loose files and
// subfolders. A re-upload with the same name replaces the older file.
async function collect(source, folderId, path) {
  const files = await source.list(folderId);
  const found = [];
  const newest = list => list.sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))[0];

  for (const shp of files.filter(f => ext(f.name) === 'shp')) {
    const prj = newest(files.filter(f => ext(f.name) === 'prj' && stem(f.name) === stem(shp.name)));
    found.push({
      origin: `${path}/${shp.name}`,
      name: shp.name,
      shp: await source.download(shp),
      prj: prj && (await source.download(prj)).toString('utf8'),
      fileTime: shp.modifiedTime || shp.createdTime,
    });
  }
  for (const zip of files.filter(f => ext(f.name) === 'zip')) {
    const entries = unzip(await source.download(zip));
    const names = Object.keys(entries).filter(n => !n.startsWith('__MACOSX'));
    for (const name of names.filter(n => ext(n) === 'shp')) {
      const prj = names.find(n => ext(n) === 'prj' && stem(n) === stem(name));
      found.push({
        origin: `${path}/${zip.name}:${name}`,
        name: zip.name,
        shp: entries[name].data,
        prj: prj && entries[prj].data.toString('utf8'),
        fileTime: zip.modifiedTime || entries[name].mtime,
      });
    }
  }
  for (const sub of files.filter(f => f.isFolder)) {
    found.push(...await collect(source, sub.id, `${path}/${sub.name}`));
  }
  return found;
}

function zoneOf(hazard, { name, origin }) {
  const words = stem(name).split(/[^a-z0-9]+/);
  const zones = HAZARDS[hazard].zones.filter(z => [z, ...(ZONE_ALIASES[z] || [])].some(w => words.includes(w)));
  if (zones.length === 1) return zones[0];
  console.warn(`[skip] ${origin}: name should contain exactly one of ${HAZARDS[hazard].zones.join(', ')}`);
  return null;
}

// ── Projection ──────────────────────────────────────────────────────────────

const R = 6378137;
const PROJECTIONS = {
  webMercator: {
    tolerance: SIMPLIFY_M,
    toLngLat: ([x, y]) => [x / R * 180 / Math.PI, (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI],
  },
  geographic: {
    tolerance: SIMPLIFY_M / 111320,
    toLngLat: p => p,
  },
};

// Hazard maps exported from ArcGIS here are Web Mercator; lon/lat also works.
// Anything else must be reprojected before upload.
function projectionOf({ prj, origin }) {
  if (!prj) throw new Error(`${origin}: no .prj file, so the coordinate system is unknown`);
  const wkt = prj.trim();
  if (/^PROJCS/i.test(wkt) && /Mercator_Auxiliary_Sphere|Pseudo[_ ]Mercator|Popular_Visualisation|Web_Mercator/i.test(wkt)) {
    return PROJECTIONS.webMercator;
  }
  if (/^GEOGCS/i.test(wkt)) {
    if (!/WGS_?1984|WGS 84|PRS_?1992|PRS92/i.test(wkt)) console.warn(`[prj] ${origin}: datum is not WGS84; positions may be off`);
    return PROJECTIONS.geographic;
  }
  throw new Error(`${origin}: unsupported coordinate system (${wkt.slice(0, 60)}…). Export as WGS84 or Web Mercator.`);
}

// ── Geometry ────────────────────────────────────────────────────────────────

// Douglas–Peucker on a closed ring, iterative so long rings don't overflow.
function simplify(ring, tolerance) {
  if (ring.length <= 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = ring[a];
    const [bx, by] = ring[b];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let far = -1, farDist = tolerance;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = ring[i];
      const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
      const d = Math.hypot(px - ax - t * dx, py - ay - t * dy);
      if (d > farDist) { far = i; farDist = d; }
    }
    if (far !== -1) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return ring.filter((_, i) => keep[i]);
}

// Positive for counter-clockwise rings.
const signedArea = ring => ring.reduce((s, [x1, y1], i) => {
  const [x2, y2] = ring[(i + 1) % ring.length];
  return s + x1 * y2 - x2 * y1;
}, 0) / 2;

function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[j];
    if ((y1 > y) !== (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

// Shapefile polygons list clockwise outer rings and counter-clockwise holes in
// one flat list; GeoJSON nests each hole under its outer ring, wound the other
// way round (RFC 7946). Each hole goes to the smallest outer ring holding it.
function toGeometry(parts, { tolerance, toLngLat }) {
  const rings = parts
    .map(part => simplify(part, tolerance))
    .filter(ring => ring.length >= 4)
    .map(ring => ({ ring, area: signedArea(ring) }));
  const outers = rings.filter(r => r.area < 0).map(r => ({ ...r, holes: [] }));
  for (const hole of rings.filter(r => r.area > 0)) {
    const owner = outers
      .filter(o => pointInRing(hole.ring[0], o.ring))
      .sort((a, b) => b.area - a.area)[0];
    if (owner) owner.holes.push(hole.ring);
    else outers.push({ ring: [...hole.ring].reverse(), area: -hole.area, holes: [] });
  }
  const out = ring => ring.map(p => toLngLat(p).map(v => +v.toFixed(6)));
  const polygons = outers.map(o => [out([...o.ring].reverse()), ...o.holes.map(h => out([...h].reverse()))]);
  if (polygons.length === 0) return null;
  return polygons.length === 1
    ? { type: 'Polygon', coordinates: polygons[0] }
    : { type: 'MultiPolygon', coordinates: polygons };
}

function convert(hazard, zone, shapefile) {
  const projection = projectionOf(shapefile);
  return readShp(shapefile.shp).flatMap(rec => {
    if (!rec) return [];
    if (rec.kind !== 'polygon') throw new Error(`${shapefile.origin}: shapes are lines, not polygons`);
    const geometry = toGeometry(rec.parts, projection);
    return geometry ? [{ type: 'Feature', properties: { hazard, zone }, geometry }] : [];
  });
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const localIdx = process.argv.indexOf('--local');
  const localDir = localIdx !== -1 ? process.argv[localIdx + 1] : null;
  const source = localDir
    ? localSource()
    : driveSource(await getAccessToken('https://www.googleapis.com/auth/drive.readonly'));

  // Convert everything in memory first so a Drive failure leaves the
  // previously published zones untouched.
  const volcanoes = {};
  const outputs = [];
  for (const [volcano, folderId] of Object.entries(DRIVE_FOLDERS)) {
    const root = localDir ? join(localDir, volcano) : folderId;
    const folders = (await source.list(root)).filter(f => f.isFolder);
    for (const folder of folders) {
      const hazard = Object.keys(HAZARDS).find(h => HAZARDS[h].folders.includes(folderKey(folder.name)));
      if (!hazard) {
        console.log(`[${volcano}] ignoring folder "${folder.name}"`);
        continue;
      }
      const byZone = {};
      for (const shapefile of await collect(source, folder.id, `${volcano}/${folder.name}`)) {
        const zone = zoneOf(hazard, shapefile);
        if (!zone) continue;
        if (byZone[zone]) {
          const [older, newer] = [byZone[zone], shapefile].sort((a, b) => a.fileTime.localeCompare(b.fileTime));
          console.warn(`[dupe] ${hazard} ${zone}: using ${newer.origin}, ignoring older ${older.origin}`);
          byZone[zone] = newer;
        } else {
          byZone[zone] = shapefile;
        }
      }
      const zones = HAZARDS[hazard].zones.filter(z => byZone[z]);
      if (zones.length === 0) {
        console.warn(`[${volcano}] ${folder.name}: no zone shapefiles found`);
        continue;
      }
      // `sets` lists alternative complete zone sets; warn only about the one in use.
      const sets = HAZARDS[hazard].sets || [HAZARDS[hazard].zones];
      const missing = (sets.find(set => set.some(z => byZone[z])) || sets[0]).filter(z => !byZone[z]);
      if (missing.length) console.warn(`[${volcano}] ${hazard}: missing zone(s) ${missing.join(', ')}`);

      const features = zones.flatMap(zone => {
        const f = convert(hazard, zone, byZone[zone]);
        const points = f.reduce((n, x) => n + x.geometry.coordinates.flat(x.geometry.type === 'Polygon' ? 1 : 2).length, 0);
        console.log(`[${volcano}] ${hazard} ${zone}: ${points} points ← ${byZone[zone].origin}`);
        return f;
      });
      const id = `${volcano.toLowerCase()}_${hazard}`;
      (volcanoes[volcano] ||= {})[hazard] = {
        url: `./data/hazard/${id}.geojson`,
        zones,
        updated: zones.map(z => byZone[z].fileTime).sort().at(-1),
      };
      outputs.push({ id, geojson: { type: 'FeatureCollection', features } });
    }
  }

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  for (const { id, geojson } of outputs) {
    await writeFile(join(OUT_DIR, `${id}.geojson`), JSON.stringify(geojson));
  }
  await writeFile(MANIFEST, JSON.stringify({ volcanoes }, null, 2) + '\n');
  console.log(`wrote ${outputs.length} hazard layer(s) → ${MANIFEST}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
