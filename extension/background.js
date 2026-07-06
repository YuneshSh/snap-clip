const DEFAULT_SETTINGS = { maxScreenshots: 10 };

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
    case 'CLEAR_TEXTS':
      clearTexts().then(sendResponse);
      return true;
    case 'GET_BOOKMARKS':
      getBookmarks().then(sendResponse);
      return true;
    case 'DELETE_BOOKMARK':
      deleteBookmark(message.id).then(sendResponse);
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
  }
});

async function getSettings() {
  const result = await chrome.storage.local.get('settings');
  return result.settings || DEFAULT_SETTINGS;
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
  // Trim existing lists if the new limit is lower.
  const screenshots = await getScreenshots();
  if (screenshots.length > settings.maxScreenshots) {
    await chrome.storage.local.set({ screenshots: screenshots.slice(0, settings.maxScreenshots) });
  }
  const texts = await getTexts();
  if (texts.length > settings.maxScreenshots) {
    await chrome.storage.local.set({ texts: texts.slice(0, settings.maxScreenshots) });
  }
  const bookmarks = await getBookmarks();
  const trimmedBookmarks = trimBookmarks(bookmarks, settings.maxScreenshots);
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

  // Skip if identical to the most recent entry.
  if (texts.length > 0 && texts[0].text === value) {
    return { success: false, reason: 'duplicate' };
  }

  const entry = {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    text: value,
    savedAt: Date.now()
  };

  texts.unshift(entry);
  if (texts.length > settings.maxScreenshots) {
    texts.splice(settings.maxScreenshots);
  }

  await chrome.storage.local.set({ texts });
  return { success: true, id: entry.id, entry };
}

async function deleteText(id) {
  const texts = await getTexts();
  await chrome.storage.local.set({ texts: texts.filter(t => t.id !== id) });
  return { success: true };
}

async function clearTexts() {
  await chrome.storage.local.set({ texts: [] });
  return { success: true };
}

// ── Bookmarks (copied URLs) ───────────────────────────────────────────────────
async function getBookmarks() {
  const result = await chrome.storage.local.get('bookmarks');
  return result.bookmarks || [];
}

// Keep every pinned bookmark, plus the newest `max` unpinned ones.
function trimBookmarks(bookmarks, max) {
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
  const trimmed = trimBookmarks(bookmarks, settings.maxScreenshots);

  await chrome.storage.local.set({ bookmarks: trimmed });
  return { success: true, id: entry.id, entry };
}

async function deleteBookmark(id) {
  const bookmarks = await getBookmarks();
  await chrome.storage.local.set({ bookmarks: bookmarks.filter(b => b.id !== id) });
  return { success: true };
}

async function toggleBookmarkPin(id) {
  const settings = await getSettings();
  let bookmarks = await getBookmarks();
  bookmarks = bookmarks.map(b => b.id === id ? { ...b, pinned: !b.pinned } : b);
  // Unpinning can push the list back over the cap, so re-trim.
  bookmarks = trimBookmarks(bookmarks, settings.maxScreenshots);
  await chrome.storage.local.set({ bookmarks });
  return { success: true };
}

// Clears only unpinned bookmarks — pinned ones are kept on purpose.
async function clearBookmarks() {
  const bookmarks = await getBookmarks();
  await chrome.storage.local.set({ bookmarks: bookmarks.filter(b => b.pinned) });
  return { success: true };
}
