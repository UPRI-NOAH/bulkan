import { state } from './state.js';
import { LIVE_FEEDS, NEWS_DATA, KANLAON_SNAPSHOTS, KANLAON_FOLDER_ID } from './config.js';

async function getKanlaonSnapshotFileId() {
  const today = new Date();
  for (let i = 0; i < 3; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = `${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(d.getFullYear()).slice(-2)}`;
    const entry = KANLAON_SNAPSHOTS[key];
    if (entry) {
      const url = entry.startsWith('./') ? entry : `https://drive.google.com/uc?export=view&id=${entry}`;
      return { id: key, name: `snap${key}`, url };
    }
  }
  const sorted = Object.keys(KANLAON_SNAPSHOTS).sort().reverse();
  if (sorted.length === 0) return null;
  const latestKey = sorted[0];
  const entry = KANLAON_SNAPSHOTS[latestKey];
  const url = entry.startsWith('./') ? entry : `https://drive.google.com/uc?export=view&id=${entry}`;
  return { id: latestKey, name: `snap${latestKey}`, url };
}

function updateKanlaonSnapshot() {
  const videoContainer = document.getElementById('video-container');
  videoContainer.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;background:var(--surface2)">
      <div style="font-size:24px;margin-bottom:0.5rem;animation:pulse 1.5s ease-in-out infinite">📷</div>
      <p style="margin:0 0 0.5rem 0;font-weight:600;color:var(--text)">Kanlaon Camera Feed</p>
      <p style="margin:0 0 1rem 0;font-size:11px;color:var(--text2)">Loading latest snapshot...</p>
      <div style="width:40px;height:40px;border:3px solid var(--accent);border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite"></div>
    </div>`;

  getKanlaonSnapshotFileId().then(fileData => {
    if (fileData && fileData.url) {
      const img = new Image();
      img.onload = () => {
        videoContainer.innerHTML = `<img src="${fileData.url}" alt="Kanlaon snapshot" style="width:100%;height:100%;object-fit:cover;">`;
      };
      img.onerror = () => {
        videoContainer.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;background:var(--surface2);color:var(--text2);text-align:center;padding:1rem">
            <div style="font-size:24px;margin-bottom:0.5rem">⚠️</div>
            <p style="margin:0;font-size:11px">Unable to load image</p>
            <p style="margin:0.5rem 0 0 0;font-size:9px;color:var(--text3)">File: ${fileData.name}</p>
          </div>`;
      };
      img.src = fileData.url;
    } else {
      videoContainer.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;background:var(--surface2);padding:1rem;text-align:center">
          <div style="font-size:28px;margin-bottom:0.5rem">📷</div>
          <p style="margin:0 0 0.5rem 0;font-weight:600;color:var(--text)">Kanlaon Camera Feed</p>
          <p style="margin:0 0 1rem 0;font-size:11px;color:var(--text2)">No snapshots found</p>
          <a href="https://drive.google.com/drive/folders/${KANLAON_FOLDER_ID}?usp=sharing" target="_blank"
             style="display:inline-block;padding:0.5rem 1rem;background:var(--accent);color:white;text-decoration:none;border-radius:4px;font-size:10px;margin-bottom:0.5rem">
            Open Kanlaon Folder
          </a>
          <p style="margin:0.5rem 0 0 0;font-size:8px;color:var(--text3)">🔄 Auto-updates every 5 minutes</p>
        </div>`;
    }
  });
}

export function updateLiveFeeds() {
  const videoContainer = document.getElementById('video-container');
  const feed = LIVE_FEEDS[state.currentVolcano];
  if (!feed || feed.type === 'none') {
    videoContainer.classList.add('hidden');
    videoContainer.innerHTML = '';
  } else if (feed.type === 'facebook' || feed.type === 'youtube') {
    videoContainer.classList.remove('hidden');
    videoContainer.innerHTML = feed.embed;
  } else if (feed.type === 'snapshot') {
    videoContainer.classList.remove('hidden');
    if (state.currentVolcano === 'Kanlaon') updateKanlaonSnapshot();
    else videoContainer.innerHTML = '<div class="video-placeholder">Loading snapshot...</div>';
  }
  updateNews();
}

export function updateNews() {
  const newsContainer = document.getElementById('news-container');
  const news = NEWS_DATA[state.currentVolcano] || [];
  newsContainer.innerHTML = news.map(item => `
    <a href="${item.url}" target="_blank" class="news-item">
      <h4>${item.title}</h4>
      <p>${item.description}</p>
      <div class="news-date">📅 Latest updates</div>
    </a>`).join('');
}
