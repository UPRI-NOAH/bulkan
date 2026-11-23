// Minimal readers for zipped ESRI shapefiles: just the .shp geometry and .dbf
// attributes the builders need, with no dependencies.
import { inflateRawSync } from 'node:zlib';

export const ext = name => name.slice(name.lastIndexOf('.') + 1).toLowerCase();
export const stem = name => name.slice(0, name.lastIndexOf('.')).toLowerCase();

// name → { data, mtime } for every entry in a zip.
export function unzip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    files[name] = { data: method === 8 ? inflateRawSync(data) : data, mtime: dosTime(buf, p + 12) };
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

// Zip entries store an MS-DOS local timestamp; treated as UTC.
function dosTime(buf, at) {
  const t = buf.readUInt16LE(at);
  const d = buf.readUInt16LE(at + 2);
  return new Date(Date.UTC(1980 + (d >> 9), ((d >> 5) & 15) - 1, d & 31, t >> 11, (t >> 5) & 63, (t & 31) * 2)).toISOString();
}

export function readDbf(buf) {
  const nrec = buf.readUInt32LE(4);
  const hlen = buf.readUInt16LE(8);
  const rlen = buf.readUInt16LE(10);
  const fields = [];
  for (let p = 32; buf[p] !== 0x0d; p += 32) {
    fields.push({
      name: buf.toString('latin1', p, p + 11).replace(/\0.*$/, ''),
      type: String.fromCharCode(buf[p + 11]),
      len: buf[p + 16],
    });
  }
  const rows = [];
  for (let i = 0; i < nrec; i++) {
    let off = hlen + i * rlen + 1;
    const row = {};
    for (const f of fields) {
      const raw = buf.toString('latin1', off, off + f.len).trim();
      off += f.len;
      row[f.name] = 'NF'.includes(f.type) && raw !== '' ? Number(raw) : raw;
    }
    rows.push(row);
  }
  return rows;
}

const SHAPE_KINDS = { 3: 'line', 13: 'line', 23: 'line', 5: 'polygon', 15: 'polygon', 25: 'polygon' };

// One entry per record: null for a null shape, else { kind, parts } where
// parts are arrays of [x, y] in the file's own coordinates.
export function readShp(buf) {
  const records = [];
  for (let p = 100; p < buf.length;) {
    const len = buf.readInt32BE(p + 4) * 2;
    const body = buf.subarray(p + 8, p + 8 + len);
    p += 8 + len;
    const type = body.readInt32LE(0);
    if (type === 0) { records.push(null); continue; }
    const kind = SHAPE_KINDS[type];
    if (!kind) throw new Error(`shape type ${type} is not a PolyLine or Polygon`);
    const nparts = body.readInt32LE(36);
    const npts = body.readInt32LE(40);
    const starts = Array.from({ length: nparts }, (_, i) => body.readInt32LE(44 + 4 * i)).concat(npts);
    const p0 = 44 + 4 * nparts;
    const pts = Array.from({ length: npts }, (_, i) => [body.readDoubleLE(p0 + 16 * i), body.readDoubleLE(p0 + 16 * i + 8)]);
    records.push({ kind, parts: starts.slice(0, -1).map((s, i) => pts.slice(s, starts[i + 1])) });
  }
  return records;
}
