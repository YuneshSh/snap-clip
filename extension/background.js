const DEFAULT_SETTINGS = { maxScreenshots: 10, theme: 'ocean' };

// ── Native companion (clipboard monitor) ────────────────────────────────────
// The Swift native host watches the OS clipboard even when the browser isn't
// focused and streams images here over Native Messaging. Large images are sent
// in chunks (Chrome caps a single host->extension message at ~1 MB), so we
// reassemble them here before saving.
const NATIVE_HOST = 'com.snapclip.clipboard';
const RECONNECT_MIN_MS = 3000;      // host present but dropped -> reconnect fast
const RECONNECT_MAX_MS = 5 * 60000; // host missing -> back off to avoid spam

let nativePort = null;
let nativeConnected = false;
let reconnectDelay = RECONNECT_MIN_MS;
let reconnectTimer = null;
const imageBuffers = new Map(); // id -> { parts: string[], total: number }

// Reflect the companion's live state to any open popup (best-effort: the popup
// may not be open, so ignore "no receiver" errors).
function setNativeConnected(connected) {
  if (nativeConnected === connected) return;
  nativeConnected = connected;
  chrome.runtime.sendMessage({ type: 'NATIVE_STATUS', connected }).catch(() => {});
}

function connectNative() {
  if (nativePort) return;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

  let port;
  try {
    port = chrome.runtime.connectNative(NATIVE_HOST);
  } catch {
    scheduleReconnect(false);
    return;
  }
  nativePort = port;

  port.onMessage.addListener((msg) => {
    // Any inbound message means the host is alive; keep reconnects snappy and
    // reset the service-worker idle timer (heartbeats flow every ~20s).
    reconnectDelay = RECONNECT_MIN_MS;
    setNativeConnected(true);
    handleNativeMessage(msg);
  });

  port.onDisconnect.addListener(() => {
    const err = chrome.runtime.lastError;
    nativePort = null;
    setNativeConnected(false);
    imageBuffers.clear();
    // If the host isn't installed, Chrome reports "not found" -> back off hard.
    const missing = err && /not found|forbidden|failed to start/i.test(err.message || '');
    scheduleReconnect(missing);
  });
}

function scheduleReconnect(missing) {
  if (reconnectTimer) return;
  const delay = missing ? RECONNECT_MAX_MS : reconnectDelay;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectNative();
  }, delay);
  if (!missing) {
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
  }
}

function handleNativeMessage(msg) {
  if (!msg || !msg.type) return;

  // Both images and text arrive chunked (Chrome caps a host message at ~1 MB).
  if (msg.type === 'image' || msg.type === 'text') {
    let buf = imageBuffers.get(msg.id);
    if (!buf) {
      buf = { parts: new Array(msg.total).fill(''), total: msg.total, kind: msg.type };
      imageBuffers.set(msg.id, buf);
    }
    buf.parts[msg.index] = msg.chunk || '';
    if (msg.last || buf.parts.every((p) => p !== '')) {
      const payload = buf.parts.join('');
      imageBuffers.delete(msg.id);
      if (buf.kind === 'image') {
        if (payload.startsWith('data:image/')) saveScreenshot(payload);
      } else {
        if (payload.trim()) saveText(payload);
      }
    }
    return;
  }
  // 'hello' / 'heartbeat' are keep-alive only; nothing to do.
}

// Keep the connection resilient across service-worker restarts.
chrome.runtime.onStartup.addListener(connectNative);
chrome.runtime.onInstalled.addListener(connectNative);
if (chrome.alarms) {
  chrome.alarms.create('snapclip-native-keepalive', { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'snapclip-native-keepalive' && !nativePort) connectNative();
  });
}
connectNative();

const viewerWindowsByShot = new Map();

async function openViewerWindow(shotId, width, height) {
  if (!shotId) return { success: false, reason: 'missing_id' };
  const shots = await getScreenshots();
  if (!shots.some(s => s.id === shotId)) {
    return { success: false, reason: 'not_found' };
  }

  const existingId = viewerWindowsByShot.get(shotId);
  if (existingId != null) {
    try {
      const win = await chrome.windows.get(existingId);
      if (win) {
        await chrome.windows.update(existingId, { focused: true, drawAttention: true });
        return { success: true, windowId: existingId, focused: true };
      }
    } catch {
      viewerWindowsByShot.delete(shotId);
    }
  }

  const url = chrome.runtime.getURL(`viewer.html?id=${encodeURIComponent(shotId)}`);
  const w = Math.min(Math.max(Number(width) || 1200, 640), 1600);
  const h = Math.min(Math.max(Number(height) || 860, 480), 1200);

  const win = await chrome.windows.create({
    url,
    type: 'popup',
    width: w,
    height: h,
    focused: true
  });

  if (win?.id != null) {
    viewerWindowsByShot.set(shotId, win.id);
    const onRemoved = (windowId) => {
      if (windowId === win.id) {
        viewerWindowsByShot.delete(shotId);
        chrome.windows.onRemoved.removeListener(onRemoved);
      }
    };
    chrome.windows.onRemoved.addListener(onRemoved);
  }

  return { success: true, windowId: win?.id };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'SAVE_SCREENSHOT':
      saveScreenshot(message.dataUrl).then(sendResponse);
      return true;
    case 'GET_SCREENSHOTS':
      getScreenshots().then(sendResponse);
      return true;
    case 'DELETE_SCREENSHOT':
      deleteScreenshot(message.id).then(sendResponse);
      return true;
    case 'DELETE_SCREENSHOTS':
      deleteScreenshots(message.ids).then(sendResponse);
      return true;
    case 'RESTORE_SCREENSHOTS':
      restoreScreenshots(message.items).then(sendResponse);
      return true;
    case 'UPDATE_SCREENSHOT':
      updateScreenshot(message.id, message.patch).then(sendResponse);
      return true;
    case 'CLEAR_ALL':
      clearAll().then(sendResponse);
      return true;
    case 'GET_TEXTS':
      getTexts().then(sendResponse);
      return true;
    case 'SAVE_TEXT':
      saveText(message.text).then(sendResponse);
      return true;
    case 'DELETE_TEXT':
      deleteText(message.id).then(sendResponse);
      return true;
    case 'DELETE_TEXTS':
      deleteTexts(message.ids).then(sendResponse);
      return true;
    case 'RESTORE_TEXTS':
      restoreTexts(message.items).then(sendResponse);
      return true;
    case 'TOGGLE_TEXT_PIN':
      toggleTextPin(message.id).then(sendResponse);
      return true;
    case 'CLEAR_TEXTS':
      clearTexts().then(sendResponse);
      return true;
    case 'GET_NOTES':
      getNotes().then(sendResponse);
      return true;
    case 'ADD_NOTE':
      addNote(message.date, message.text).then(sendResponse);
      return true;
    case 'DELETE_NOTE':
      deleteNote(message.id).then(sendResponse);
      return true;
    case 'GET_BOOKMARKS':
      getBookmarks().then(sendResponse);
      return true;
    case 'DELETE_BOOKMARK':
      deleteBookmark(message.id).then(sendResponse);
      return true;
    case 'DELETE_BOOKMARKS':
      deleteBookmarks(message.ids).then(sendResponse);
      return true;
    case 'RESTORE_BOOKMARKS':
      restoreBookmarks(message.items).then(sendResponse);
      return true;
    case 'FETCH_LINK_PREVIEW':
      fetchLinkPreview(message.id, message.url).then(sendResponse);
      return true;
    case 'TOGGLE_BOOKMARK_PIN':
      toggleBookmarkPin(message.id).then(sendResponse);
      return true;
    case 'CLEAR_BOOKMARKS':
      clearBookmarks().then(sendResponse);
      return true;
    case 'GET_SETTINGS':
      getSettings().then(sendResponse);
      return true;
    case 'SAVE_SETTINGS':
      saveSettings(message.settings).then(sendResponse);
      return true;
    case 'GET_NATIVE_STATUS':
      sendResponse({ connected: nativeConnected });
      return false;
    case 'OPEN_VIEWER':
      openViewerWindow(message.id, message.width, message.height).then(sendResponse);
      return true;
  }
});

async function getSettings() {
  const result = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(result.settings || {}) };
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
  // Trim existing lists if the new limit is lower.
  const screenshots = await getScreenshots();
  if (screenshots.length > settings.maxScreenshots) {
    await chrome.storage.local.set({ screenshots: screenshots.slice(0, settings.maxScreenshots) });
  }
  const texts = await getTexts();
  const trimmedTexts = trimPinAware(texts, settings.maxScreenshots);
  if (trimmedTexts.length !== texts.length) {
    await chrome.storage.local.set({ texts: trimmedTexts });
  }
  const bookmarks = await getBookmarks();
  const trimmedBookmarks = trimPinAware(bookmarks, settings.maxScreenshots);
  if (trimmedBookmarks.length !== bookmarks.length) {
    await chrome.storage.local.set({ bookmarks: trimmedBookmarks });
  }
  return { success: true };
}

async function getScreenshots() {
  const result = await chrome.storage.local.get('screenshots');
  return result.screenshots || [];
}

// Saves are serialized through this promise chain so that rapid, back-to-back
// captures don't race on the read-modify-write of storage (which would cause
// concurrent saves to overwrite each other and drop screenshots).
let saveQueue = Promise.resolve();

function saveScreenshot(dataUrl) {
  const run = saveQueue.then(() => doSaveScreenshot(dataUrl));
  // Keep the queue alive even if one save rejects.
  saveQueue = run.catch(() => {});
  return run;
}

async function doSaveScreenshot(dataUrl) {
  const settings = await getSettings();
  const screenshots = await getScreenshots();

  // Deduplicate: skip if identical to the most recent screenshot
  if (screenshots.length > 0 && screenshots[0].dataUrl === dataUrl) {
    return { success: false, reason: 'duplicate' };
  }

  const entry = {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    dataUrl,
    savedAt: Date.now()
  };

  screenshots.unshift(entry);

  if (screenshots.length > settings.maxScreenshots) {
    screenshots.splice(settings.maxScreenshots);
  }

  await chrome.storage.local.set({ screenshots });
  return { success: true, id: entry.id, entry };
}

async function deleteScreenshot(id) {
  const screenshots = await getScreenshots();
  await chrome.storage.local.set({ screenshots: screenshots.filter(s => s.id !== id) });
  return { success: true };
}

async function deleteScreenshots(ids) {
  const idSet = new Set(ids || []);
  const screenshots = await getScreenshots();
  const before = screenshots.length;
  const next = screenshots.filter(s => !idSet.has(s.id));
  await chrome.storage.local.set({ screenshots: next });
  return { success: true, deleted: before - next.length };
}

async function restoreScreenshots(items) {
  if (!items?.length) return { success: true, restored: 0 };
  const settings = await getSettings();
  const screenshots = await getScreenshots();
  const existing = new Set(screenshots.map(s => s.id));
  const toAdd = items.filter(i => !existing.has(i.id));
  const merged = [...toAdd, ...screenshots];
  const capped = merged.slice(0, settings.maxScreenshots);
  await chrome.storage.local.set({ screenshots: capped });
  return { success: true, restored: toAdd.length };
}

async function updateScreenshot(id, patch) {
  const screenshots = await getScreenshots();
  const idx = screenshots.findIndex(s => s.id === id);
  if (idx === -1) return { success: false, reason: 'not_found' };
  screenshots[idx] = { ...screenshots[idx], ...patch };
  await chrome.storage.local.set({ screenshots });
  return { success: true };
}

async function clearAll() {
  await chrome.storage.local.set({ screenshots: [] });
  return { success: true };
}

// ── Text clipboard ──────────────────────────────────────────────────────────
async function getTexts() {
  const result = await chrome.storage.local.get('texts');
  return result.texts || [];
}

// A copied string that is a bare URL is routed to the Bookmarks list instead of
// the plain-text list.
function isUrl(s) {
  const t = (s || '').trim();
  if (!t || /\s/.test(t)) return false;
  return /^https?:\/\/\S+$/i.test(t) || /^www\.\S+\.\S+$/i.test(t);
}

// Serialize text saves for the same reason screenshot saves are serialized.
let textSaveQueue = Promise.resolve();

function saveText(text) {
  const value = (text || '').trim();
  if (isUrl(value)) return saveBookmark(value);
  const run = textSaveQueue.then(() => doSaveText(text));
  textSaveQueue = run.catch(() => {});
  return run;
}

async function doSaveText(text) {
  const value = (text || '').trim();
  if (!value) return { success: false, reason: 'empty' };

  const settings = await getSettings();
  const texts = await getTexts();

  // Skip if this text is already saved (pinned or not).
  if (texts.some(t => t.text === value)) {
    return { success: false, reason: 'duplicate' };
  }

  const entry = {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    text: value,
    savedAt: Date.now(),
    pinned: false
  };

  texts.unshift(entry);
  // Keep every pinned entry, plus the newest `max` unpinned ones.
  const trimmed = trimPinAware(texts, settings.maxScreenshots);

  await chrome.storage.local.set({ texts: trimmed });
  return { success: true, id: entry.id, entry };
}

async function deleteText(id) {
  const texts = await getTexts();
  await chrome.storage.local.set({ texts: texts.filter(t => t.id !== id) });
  return { success: true };
}

async function deleteTexts(ids) {
  const idSet = new Set(ids || []);
  const texts = await getTexts();
  const before = texts.length;
  const next = texts.filter(t => !idSet.has(t.id));
  await chrome.storage.local.set({ texts: next });
  return { success: true, deleted: before - next.length };
}

async function restoreTexts(items) {
  if (!items?.length) return { success: true, restored: 0 };
  const settings = await getSettings();
  const texts = await getTexts();
  const existing = new Set(texts.map(t => t.id));
  const toAdd = items.filter(i => !existing.has(i.id));
  const merged = [...toAdd, ...texts];
  await chrome.storage.local.set({ texts: trimPinAware(merged, settings.maxScreenshots) });
  return { success: true, restored: toAdd.length };
}

async function toggleTextPin(id) {
  const settings = await getSettings();
  let texts = await getTexts();
  const idx = texts.findIndex(t => t.id === id);
  if (idx === -1) return { success: false, reason: 'not_found' };
  const pinned = !Boolean(texts[idx].pinned);
  texts = texts.map(t => t.id === id ? { ...t, pinned } : t);
  texts = trimPinAware(texts, settings.maxScreenshots);
  await chrome.storage.local.set({ texts });
  return { success: true, pinned };
}

// Clears only unpinned texts — pinned ones are kept on purpose.
async function clearTexts() {
  const texts = await getTexts();
  await chrome.storage.local.set({ texts: texts.filter(t => t.pinned) });
  return { success: true };
}

// ── Bookmarks (copied URLs) ───────────────────────────────────────────────────
async function getBookmarks() {
  const result = await chrome.storage.local.get('bookmarks');
  return result.bookmarks || [];
}

// Keep every pinned bookmark, plus the newest `max` unpinned ones.
function trimPinAware(bookmarks, max) {
  let unpinned = 0;
  return bookmarks.filter(b => {
    if (b.pinned) return true;
    unpinned += 1;
    return unpinned <= max;
  });
}

let bookmarkSaveQueue = Promise.resolve();

function saveBookmark(url) {
  const run = bookmarkSaveQueue.then(() => doSaveBookmark(url));
  bookmarkSaveQueue = run.catch(() => {});
  return run;
}

async function doSaveBookmark(url) {
  const value = (url || '').trim();
  if (!value) return { success: false, reason: 'empty' };

  const settings = await getSettings();
  const bookmarks = await getBookmarks();

  // Dedup by URL: if it already exists, don't add a second copy.
  if (bookmarks.some(b => b.url === value)) {
    return { success: false, reason: 'duplicate' };
  }

  const entry = {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    url: value,
    savedAt: Date.now(),
    pinned: false
  };

  bookmarks.unshift(entry);
  const trimmed = trimPinAware(bookmarks, settings.maxScreenshots);

  await chrome.storage.local.set({ bookmarks: trimmed });
  fetchLinkPreview(entry.id, value);
  return { success: true, id: entry.id, entry };
}

function normalizeUrl(url) {
  return /^https?:\/\//i.test(url) ? url : 'https://' + url;
}

function parseTitleFromHtml(html) {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  const tit = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return (og?.[1] || tit?.[1] || '').replace(/\s+/g, ' ').trim();
}

async function patchBookmark(id, patch) {
  const bookmarks = await getBookmarks();
  const idx = bookmarks.findIndex(b => b.id === id);
  if (idx === -1) return { success: false, reason: 'not_found' };
  bookmarks[idx] = { ...bookmarks[idx], ...patch };
  await chrome.storage.local.set({ bookmarks });
  return { success: true };
}

async function fetchLinkPreview(id, url) {
  try {
    const normalized = normalizeUrl(url);
    const hostname = new URL(normalized).hostname.replace(/^www\./, '');
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
    let title = hostname;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(normalized, { signal: controller.signal, redirect: 'follow' });
      clearTimeout(timer);
      if (res.ok) {
        const html = await res.text();
        const parsed = parseTitleFromHtml(html);
        if (parsed) title = parsed;
      }
    } catch {
      clearTimeout(timer);
    }
    await patchBookmark(id, { title, faviconUrl, previewFetchedAt: Date.now() });
    return { success: true, title, faviconUrl };
  } catch {
    return { success: false };
  }
}

async function deleteBookmark(id) {
  const bookmarks = await getBookmarks();
  await chrome.storage.local.set({ bookmarks: bookmarks.filter(b => b.id !== id) });
  return { success: true };
}

async function deleteBookmarks(ids) {
  const idSet = new Set(ids || []);
  const bookmarks = await getBookmarks();
  const before = bookmarks.length;
  const next = bookmarks.filter(b => !idSet.has(b.id));
  await chrome.storage.local.set({ bookmarks: next });
  return { success: true, deleted: before - next.length };
}

async function restoreBookmarks(items) {
  if (!items?.length) return { success: true, restored: 0 };
  const settings = await getSettings();
  const bookmarks = await getBookmarks();
  const existing = new Set(bookmarks.map(b => b.id));
  const toAdd = items.filter(i => !existing.has(i.id));
  const merged = [...toAdd, ...bookmarks];
  await chrome.storage.local.set({ bookmarks: trimPinAware(merged, settings.maxScreenshots) });
  return { success: true, restored: toAdd.length };
}

async function toggleBookmarkPin(id) {
  const settings = await getSettings();
  let bookmarks = await getBookmarks();
  bookmarks = bookmarks.map(b => b.id === id ? { ...b, pinned: !b.pinned } : b);
  // Unpinning can push the list back over the cap, so re-trim.
  bookmarks = trimPinAware(bookmarks, settings.maxScreenshots);
  await chrome.storage.local.set({ bookmarks });
  return { success: true };
}

// Clears only unpinned bookmarks — pinned ones are kept on purpose.
async function clearBookmarks() {
  const bookmarks = await getBookmarks();
  await chrome.storage.local.set({ bookmarks: bookmarks.filter(b => b.pinned) });
  return { success: true };
}

// ── Calendar notes / reminders ────────────────────────────────────────────────
// Notes are a flat list: { id, date: 'YYYY-MM-DD', text, createdAt }.
async function getNotes() {
  const result = await chrome.storage.local.get('notes');
  return result.notes || [];
}

let noteSaveQueue = Promise.resolve();

function addNote(date, text) {
  const run = noteSaveQueue.then(() => doAddNote(date, text));
  noteSaveQueue = run.catch(() => {});
  return run;
}

async function doAddNote(date, text) {
  const value = (text || '').trim();
  if (!date || !value) return { success: false, reason: 'empty' };
  const notes = await getNotes();
  const entry = {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    date,
    text: value,
    createdAt: Date.now()
  };
  notes.push(entry);
  await chrome.storage.local.set({ notes });
  return { success: true, id: entry.id, entry };
}

async function deleteNote(id) {
  const notes = await getNotes();
  await chrome.storage.local.set({ notes: notes.filter(n => n.id !== id) });
  return { success: true };
}
