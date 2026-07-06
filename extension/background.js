const DEFAULT_SETTINGS = { maxScreenshots: 10 };

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

async function saveScreenshot(dataUrl) {
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
