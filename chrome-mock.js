/**
 * chrome-mock.js
 * Simulates chrome.storage.local and chrome.runtime.sendMessage so that
 * extension/popup.js runs in a normal browser tab for preview purposes.
 */

const _PREVIEW_KEY = '__snapclip_preview__';

// Storage-change listeners (so popup.js live-render path works in the preview).
const _onChangedListeners = [];

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
      const changes = {};
      for (const k of Object.keys(data)) {
        changes[k] = { oldValue: d[k], newValue: data[k] };
      }
      Object.assign(d, data);
      dump(d);
      _onChangedListeners.forEach(fn => { try { fn(changes, 'local'); } catch { /* ignore */ } });
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

// ── Sample copied texts ──────────────────────────────────────────────────────
const SAMPLE_TEXTS = [
  { id: 'text_2', text: 'npm run dev', savedAt: Date.now() - 1000 * 60 * 9, pinned: false },
  { id: 'text_3', text: 'The quick brown fox jumps over the lazy dog. A pangram often used to preview fonts and test copied text of a few lines.', savedAt: Date.now() - 1000 * 60 * 40, pinned: true },
  { id: 'text_4', text: 'user@example.com', savedAt: Date.now() - 1000 * 60 * 60 * 5, pinned: false },
];

// ── Sample bookmarks (copied URLs) ────────────────────────────────────────────
const SAMPLE_BOOKMARKS = [
  { id: 'bm_1', url: 'https://github.com/YuneshSh/snapClip', savedAt: Date.now() - 1000 * 60 * 3, pinned: true },
  { id: 'bm_2', url: 'https://developer.chrome.com/docs/extensions', savedAt: Date.now() - 1000 * 60 * 25, pinned: false },
  { id: 'bm_3', url: 'https://vercel.com/docs', savedAt: Date.now() - 1000 * 60 * 60 * 2, pinned: false },
];

// ── Sample calendar notes (a few on today so the ticker has something to show) ─
function _dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const _today = new Date();
const _tomorrow = new Date(Date.now() + 1000 * 60 * 60 * 24);
const SAMPLE_NOTES = [
  { id: 'note_1', date: _dateStr(_today), text: 'Ship SnapClip v1.1 build', createdAt: Date.now() - 1000 * 60 * 30 },
  { id: 'note_2', date: _dateStr(_today), text: 'Review PR feedback at 4pm', createdAt: Date.now() - 1000 * 60 * 20 },
  { id: 'note_3', date: _dateStr(_tomorrow), text: 'Design sync', createdAt: Date.now() - 1000 * 60 * 10 },
];

// Seed sample data synchronously so popup.js reads them immediately on first load
(() => {
  try {
    const d = JSON.parse(localStorage.getItem(_PREVIEW_KEY) || '{}');
    if (!d._seeded || !d.notes) {
      d.screenshots = d.screenshots || SAMPLES;
      d.texts = d.texts || SAMPLE_TEXTS;
      d.bookmarks = d.bookmarks || SAMPLE_BOOKMARKS;
      d.notes = d.notes || SAMPLE_NOTES;
      d.settings = d.settings || { maxScreenshots: 10, theme: 'ocean' };
      d._seeded = true;
      localStorage.setItem(_PREVIEW_KEY, JSON.stringify(d));
    }
  } catch { /* ignore storage errors in sandboxed environments */ }
})();

// ── Background logic (inline mirror of extension/background.js) ──────────────
const DEFAULT_SETTINGS = { maxScreenshots: 10, theme: 'ocean' };

async function bgGetSettings() {
  const r = await _store.get('settings');
  return { ...DEFAULT_SETTINGS, ...(r.settings || {}) };
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

// ── Text clipboard (mirror of extension/background.js) ───────────────────────
async function bgGetTexts() {
  const r = await _store.get('texts');
  return r.texts || [];
}

function _isUrl(s) {
  const t = (s || '').trim();
  if (!t || /\s/.test(t)) return false;
  return /^https?:\/\/\S+$/i.test(t) || /^www\.\S+\.\S+$/i.test(t);
}

let _textSaveQueue = Promise.resolve();
function bgSaveText(text) {
  const value = (text || '').trim();
  if (_isUrl(value)) return bgSaveBookmark(value);
  const run = _textSaveQueue.then(() => _doSaveText(text));
  _textSaveQueue = run.catch(() => {});
  return run;
}

async function _doSaveText(text) {
  const value = (text || '').trim();
  if (!value) return { success: false, reason: 'empty' };
  const settings = await bgGetSettings();
  const texts = await bgGetTexts();
  if (texts.some(t => t.text === value)) {
    return { success: false, reason: 'duplicate' };
  }
  const entry = {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    text: value,
    savedAt: Date.now(),
    pinned: false,
  };
  texts.unshift(entry);
  await _store.set({ texts: _trimPinAware(texts, settings.maxScreenshots) });
  return { success: true, id: entry.id, entry };
}

async function bgDeleteText(id) {
  const texts = await bgGetTexts();
  await _store.set({ texts: texts.filter(t => t.id !== id) });
  return { success: true };
}

async function bgToggleTextPin(id) {
  const settings = await bgGetSettings();
  let texts = await bgGetTexts();
  texts = texts.map(t => t.id === id ? { ...t, pinned: !Boolean(t.pinned) } : t);
  texts = _trimPinAware(texts, settings.maxScreenshots);
  await _store.set({ texts });
  return { success: true };
}

async function bgClearTexts() {
  const texts = await bgGetTexts();
  await _store.set({ texts: texts.filter(t => t.pinned) });
  return { success: true };
}

// ── Bookmarks (mirror of extension/background.js) ────────────────────────────
async function bgGetBookmarks() {
  const r = await _store.get('bookmarks');
  return r.bookmarks || [];
}

function _trimPinAware(bookmarks, max) {
  let unpinned = 0;
  return bookmarks.filter(b => {
    if (b.pinned) return true;
    unpinned += 1;
    return unpinned <= max;
  });
}

let _bookmarkSaveQueue = Promise.resolve();
function bgSaveBookmark(url) {
  const run = _bookmarkSaveQueue.then(() => _doSaveBookmark(url));
  _bookmarkSaveQueue = run.catch(() => {});
  return run;
}

async function _doSaveBookmark(url) {
  const value = (url || '').trim();
  if (!value) return { success: false, reason: 'empty' };
  const settings = await bgGetSettings();
  const bookmarks = await bgGetBookmarks();
  if (bookmarks.some(b => b.url === value)) return { success: false, reason: 'duplicate' };
  const entry = {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    url: value,
    savedAt: Date.now(),
    pinned: false,
  };
  bookmarks.unshift(entry);
  await _store.set({ bookmarks: _trimPinAware(bookmarks, settings.maxScreenshots) });
  return { success: true, id: entry.id, entry };
}

async function bgDeleteBookmark(id) {
  const bookmarks = await bgGetBookmarks();
  await _store.set({ bookmarks: bookmarks.filter(b => b.id !== id) });
  return { success: true };
}

async function bgToggleBookmarkPin(id) {
  const settings = await bgGetSettings();
  let bookmarks = await bgGetBookmarks();
  bookmarks = bookmarks.map(b => b.id === id ? { ...b, pinned: !b.pinned } : b);
  bookmarks = _trimPinAware(bookmarks, settings.maxScreenshots);
  await _store.set({ bookmarks });
  return { success: true };
}

async function bgClearBookmarks() {
  const bookmarks = await bgGetBookmarks();
  await _store.set({ bookmarks: bookmarks.filter(b => b.pinned) });
  return { success: true };
}

// ── Calendar notes (mirror of extension/background.js) ───────────────────────
async function bgGetNotes() {
  const r = await _store.get('notes');
  return r.notes || [];
}

let _noteSaveQueue = Promise.resolve();
function bgAddNote(date, text) {
  const run = _noteSaveQueue.then(() => _doAddNote(date, text));
  _noteSaveQueue = run.catch(() => {});
  return run;
}

async function _doAddNote(date, text) {
  const value = (text || '').trim();
  if (!date || !value) return { success: false, reason: 'empty' };
  const notes = await bgGetNotes();
  const entry = {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    date,
    text: value,
    createdAt: Date.now(),
  };
  notes.push(entry);
  await _store.set({ notes });
  return { success: true, id: entry.id, entry };
}

async function bgDeleteNote(id) {
  const notes = await bgGetNotes();
  await _store.set({ notes: notes.filter(n => n.id !== id) });
  return { success: true };
}

// ── chrome global ────────────────────────────────────────────────────────────
window.chrome = {
  storage: {
    local: _store,
    onChanged: {
      addListener(fn) { _onChangedListeners.push(fn); },
      removeListener(fn) {
        const i = _onChangedListeners.indexOf(fn);
        if (i !== -1) _onChangedListeners.splice(i, 1);
      },
    },
  },
  runtime: {
    sendMessage(msg) {
      switch (msg.type) {
        case 'GET_SETTINGS':      return bgGetSettings();
        case 'SAVE_SETTINGS':     return bgSaveSettings(msg.settings);
        case 'GET_SCREENSHOTS':   return bgGetScreenshots();
        case 'SAVE_SCREENSHOT':   return bgSaveScreenshot(msg.dataUrl);
        case 'DELETE_SCREENSHOT': return bgDeleteScreenshot(msg.id);
        case 'CLEAR_ALL':         return bgClearAll();
        case 'GET_TEXTS':         return bgGetTexts();
        case 'SAVE_TEXT':         return bgSaveText(msg.text);
        case 'DELETE_TEXT':       return bgDeleteText(msg.id);
        case 'TOGGLE_TEXT_PIN':   return bgToggleTextPin(msg.id);
        case 'CLEAR_TEXTS':       return bgClearTexts();
        case 'GET_BOOKMARKS':     return bgGetBookmarks();
        case 'DELETE_BOOKMARK':   return bgDeleteBookmark(msg.id);
        case 'TOGGLE_BOOKMARK_PIN': return bgToggleBookmarkPin(msg.id);
        case 'CLEAR_BOOKMARKS':   return bgClearBookmarks();
        case 'GET_NOTES':         return bgGetNotes();
        case 'ADD_NOTE':          return bgAddNote(msg.date, msg.text);
        case 'DELETE_NOTE':       return bgDeleteNote(msg.id);
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
