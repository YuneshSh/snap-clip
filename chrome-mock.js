/**
 * chrome-mock.js
 * Simulates chrome.storage.local and chrome.runtime.sendMessage so that
 * extension/popup.js runs in a normal browser tab for preview purposes.
 */

const _PREVIEW_KEY = '__snapclip_preview__';

// ── Storage (backed by localStorage) ────────────────────────────────────────
const _store = (() => {
  const load = () => { try { return JSON.parse(localStorage.getItem(_PREVIEW_KEY) || '{}'); } catch { return {}; } };
  const dump = (d) => localStorage.setItem(_PREVIEW_KEY, JSON.stringify(d));
  return {
    get(keys) {
      const d = load();
      if (!keys) return Promise.resolve({ ...d });
      const arr = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys);
      const out = {};
      arr.forEach(k => { if (k in d) out[k] = d[k]; });
      return Promise.resolve(out);
    },
    set(data) {
      const d = load();
      Object.assign(d, data);
      dump(d);
      return Promise.resolve();
    },
  };
})();

// ── Sample screenshots (Pexels) ──────────────────────────────────────────────
const SAMPLES = [
  {
    id: 'sample_1',
    dataUrl: 'https://images.pexels.com/photos/417074/pexels-photo-417074.jpeg?auto=compress&cs=tinysrgb&w=600',
    savedAt: Date.now() - 1000 * 60 * 2,
  },
  {
    id: 'sample_2',
    dataUrl: 'https://images.pexels.com/photos/1323550/pexels-photo-1323550.jpeg?auto=compress&cs=tinysrgb&w=600',
    savedAt: Date.now() - 1000 * 60 * 18,
  },
  {
    id: 'sample_3',
    dataUrl: 'https://images.pexels.com/photos/1366919/pexels-photo-1366919.jpeg?auto=compress&cs=tinysrgb&w=600',
    savedAt: Date.now() - 1000 * 60 * 60 * 3,
  },
  {
    id: 'sample_4',
    dataUrl: 'https://images.pexels.com/photos/2341830/pexels-photo-2341830.jpeg?auto=compress&cs=tinysrgb&w=600',
    savedAt: Date.now() - 1000 * 60 * 60 * 24,
  },
];

// Seed sample data synchronously so popup.js reads them immediately on first load
(() => {
  try {
    const d = JSON.parse(localStorage.getItem(_PREVIEW_KEY) || '{}');
    if (!d._seeded) {
      d.screenshots = SAMPLES;
      d.settings = { maxScreenshots: 10 };
      d._seeded = true;
      localStorage.setItem(_PREVIEW_KEY, JSON.stringify(d));
    }
  } catch { /* ignore storage errors in sandboxed environments */ }
})();

// ── Background logic (inline mirror of extension/background.js) ──────────────
const DEFAULT_SETTINGS = { maxScreenshots: 10 };

async function bgGetSettings() {
  const r = await _store.get('settings');
  return r.settings || DEFAULT_SETTINGS;
}

async function bgSaveSettings(settings) {
  await _store.set({ settings });
  const r = await _store.get('screenshots');
  const shots = r.screenshots || [];
  if (shots.length > settings.maxScreenshots) {
    await _store.set({ screenshots: shots.slice(0, settings.maxScreenshots) });
  }
  return { success: true };
}

async function bgGetScreenshots() {
  const r = await _store.get('screenshots');
  return r.screenshots || [];
}

// Serialize saves (mirrors extension/background.js) so rapid captures don't race.
let _saveQueue = Promise.resolve();

function bgSaveScreenshot(dataUrl) {
  const run = _saveQueue.then(() => _doSaveScreenshot(dataUrl));
  _saveQueue = run.catch(() => {});
  return run;
}

async function _doSaveScreenshot(dataUrl) {
  const settings = await bgGetSettings();
  const shots = await bgGetScreenshots();

  if (shots.length > 0 && shots[0].dataUrl === dataUrl) {
    return { success: false, reason: 'duplicate' };
  }

  const entry = {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    dataUrl,
    savedAt: Date.now(),
  };

  shots.unshift(entry);
  if (shots.length > settings.maxScreenshots) shots.splice(settings.maxScreenshots);
  await _store.set({ screenshots: shots });
  return { success: true, id: entry.id, entry };
}

async function bgDeleteScreenshot(id) {
  const shots = await bgGetScreenshots();
  await _store.set({ screenshots: shots.filter(s => s.id !== id) });
  return { success: true };
}

async function bgClearAll() {
  await _store.set({ screenshots: [] });
  return { success: true };
}

// ── chrome global ────────────────────────────────────────────────────────────
window.chrome = {
  storage: { local: _store },
  runtime: {
    sendMessage(msg) {
      switch (msg.type) {
        case 'GET_SETTINGS':      return bgGetSettings();
        case 'SAVE_SETTINGS':     return bgSaveSettings(msg.settings);
        case 'GET_SCREENSHOTS':   return bgGetScreenshots();
        case 'SAVE_SCREENSHOT':   return bgSaveScreenshot(msg.dataUrl);
        case 'DELETE_SCREENSHOT': return bgDeleteScreenshot(msg.id);
        case 'CLEAR_ALL':         return bgClearAll();
        // Preview showcases the companion as connected.
        case 'GET_NATIVE_STATUS': return Promise.resolve({ connected: true });
        default: return Promise.resolve(null);
      }
    },
    // No cross-context messaging in the preview; provide a no-op listener so
    // popup.js's status-update subscription doesn't throw.
    onMessage: { addListener() {}, removeListener() {} },
    openOptionsPage() {
      alert('In the real extension this opens a dedicated Settings page.');
    },
  },
};
