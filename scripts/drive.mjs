// File sources for the shapefile builders: a Google Drive folder tree read
// with the service account, or a local directory tree with the same layout.
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';

export function driveSource(token) {
  const get = async (url) => {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Drive ${url.split('?')[0]}: HTTP ${res.status} ${await res.text()}`);
    return res;
  };
  return {
    async list(folderId) {
      const files = [];
      let pageToken = '';
      do {
        const params = new URLSearchParams({
          q: `'${folderId}' in parents and trashed = false`,
          fields: 'nextPageToken, files(id, name, mimeType, createdTime, modifiedTime)',
          pageSize: '1000',
          supportsAllDrives: 'true',
          includeItemsFromAllDrives: 'true',
        });
        if (pageToken) params.set('pageToken', pageToken);
        const page = await (await get(`${DRIVE_API}?${params}`)).json();
        files.push(...page.files.map(f => ({ ...f, isFolder: f.mimeType === FOLDER_MIME })));
        pageToken = page.nextPageToken;
      } while (pageToken);
      return files;
    },
    async download(file) {
      return Buffer.from(await (await get(`${DRIVE_API}/${file.id}?alt=media&supportsAllDrives=true`)).arrayBuffer());
    },
  };
}

// Same interface as driveSource; ids are paths.
export function localSource() {
  return {
    async list(dir) {
      const entries = await readdir(dir, { withFileTypes: true });
      return Promise.all(entries.filter(e => !e.name.startsWith('.')).map(async e => {
        const s = await stat(join(dir, e.name));
        return {
          id: join(dir, e.name),
          name: e.name,
          isFolder: e.isDirectory(),
          createdTime: s.birthtime.toISOString(),
          modifiedTime: s.mtime.toISOString(),
        };
      }));
    },
    download: file => readFile(file.id),
  };
}
