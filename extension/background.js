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
let reconnectDelay = RECONNECT_MIN_MS;
let reconnectTimer = null;
const imageBuffers = new Map(); // id -> { parts: string[], total: number }

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
    handleNativeMessage(msg);
  });

  port.onDisconnect.addListener(() => {
    const err = chrome.runtime.lastError;
    nativePort = null;
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

  if (msg.type === 'image') {
    let buf = imageBuffers.get(msg.id);
    if (!buf) {
      buf = { parts: new Array(msg.total).fill(''), total: msg.total };
      imageBuffers.set(msg.id, buf);
    }
    buf.parts[msg.index] = msg.chunk || '';
    if (msg.last || buf.parts.every((p) => p !== '')) {
      const dataUrl = buf.parts.join('');
      imageBuffers.delete(msg.id);
      if (dataUrl.startsWith('data:image/')) {
        saveScreenshot(dataUrl);
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
    case 'GET_SETTINGS':
      getSettings().then(sendResponse);
      return true;
    case 'SAVE_SETTINGS':
      saveSettings(message.settings).then(sendResponse);
      return true;
  }
});

async function getSettings() {
  const result = await chrome.storage.local.get('settings');
  return result.settings || DEFAULT_SETTINGS;
}

async function saveSettings(settings) {
  await chrome.storage.local.set({ settings });
  // Trim existing screenshots if new limit is lower
  const screenshots = await getScreenshots();
  if (screenshots.length > settings.maxScreenshots) {
    const trimmed = screenshots.slice(0, settings.maxScreenshots);
    await chrome.storage.local.set({ screenshots: trimmed });
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
