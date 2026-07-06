const $ = id => document.getElementById(id);

const settingsBtn    = $('settingsBtn');
const settingsPanel  = $('settingsPanel');
const maxInput       = $('maxInput');
const decrementBtn   = $('decrementBtn');
const incrementBtn   = $('incrementBtn');
const saveSettingsBtn= $('saveSettingsBtn');
const clearAllBtn    = $('clearAllBtn');
const countBadge     = $('countBadge');
const grid           = $('grid');
const emptyState     = $('emptyState');
const toast          = $('toast');
const pasteBtn       = $('pasteBtn');
const emptyPasteBtn  = $('emptyPasteBtn');
const lightbox       = $('lightbox');
const lightboxImg    = $('lightboxImg');
const lightboxTime   = $('lightboxTime');
const lightboxClose  = $('lightboxClose');
const lightboxBackdrop = $('lightboxBackdrop');
const lightboxCopy   = $('lightboxCopy');
const lightboxSave   = $('lightboxSave');
const statusDot      = $('statusDot');
const tabSnaps       = $('tabSnaps');
const tabTexts       = $('tabTexts');
const tabLinks       = $('tabLinks');
const snapsPanel     = $('snapsPanel');
const textsPanel     = $('textsPanel');
const linksPanel     = $('linksPanel');
const textList       = $('textList');
const linkList       = $('linkList');
const emptyStateTexts= $('emptyStateTexts');
const emptyStateLinks= $('emptyStateLinks');
const calChip        = $('calChip');
const calChipLabel   = $('calChipLabel');
const calPanel       = $('calPanel');
const calPrev        = $('calPrev');
const calNext        = $('calNext');
const calTitle       = $('calTitle');
const calDays        = $('calDays');
const calToday       = $('calToday');

let screenshots   = [];
let texts         = [];
let bookmarks     = [];
let settings      = { maxScreenshots: 10 };
let activeTab     = 'snaps';
let toastTimer    = null;
let capturing     = false;
let autoCaptured  = false;
let lastTextSeen  = null;

// ── Init ──────────────────────────────────────────────────────────────────
(async () => {
  [settings, screenshots, texts, bookmarks] = await Promise.all([
    send('GET_SETTINGS'),
    send('GET_SCREENSHOTS'),
    send('GET_TEXTS'),
    send('GET_BOOKMARKS')
  ]);
  maxInput.value = settings.maxScreenshots;
  renderGrid();
  renderTexts();
  renderLinks();
  updateCountBadge();
  initCalendar();

  // Silently pull the last screenshot / text from the clipboard on open.
  autoCapture();
  captureTextFromClipboard();

  // Reflect the native companion's connection state in the header.
  send('GET_NATIVE_STATUS').then(res => setNativeStatus(res && res.connected));
})();

// Live updates pushed by the background service worker.
chrome.runtime.onMessage.addListener(msg => {
  if (msg && msg.type === 'NATIVE_STATUS') setNativeStatus(msg.connected);
});

// Keep the lists in sync whenever storage changes (captures from the native
// companion, content script, or this popup all flow through here).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.screenshots) {
    screenshots = changes.screenshots.newValue || [];
    renderGrid();
  }
  if (changes.texts) {
    texts = changes.texts.newValue || [];
    renderTexts();
  }
  if (changes.bookmarks) {
    bookmarks = changes.bookmarks.newValue || [];
    renderLinks();
  }
  if (changes.screenshots || changes.texts || changes.bookmarks) updateCountBadge();
});

// ── Tabs ────────────────────────────────────────────────────────────────────
const TABS = {
  snaps: { btn: tabSnaps, panel: snapsPanel },
  texts: { btn: tabTexts, panel: textsPanel },
  links: { btn: tabLinks, panel: linksPanel }
};

function switchTab(tab) {
  activeTab = tab;
  for (const [name, { btn, panel }] of Object.entries(TABS)) {
    const on = name === tab;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', String(on));
    panel.hidden = !on;
  }
  updateCountBadge();
}
tabSnaps.addEventListener('click', () => switchTab('snaps'));
tabTexts.addEventListener('click', () => switchTab('texts'));
tabLinks.addEventListener('click', () => switchTab('links'));

function updateCountBadge() {
  const n = activeTab === 'snaps' ? screenshots.length
          : activeTab === 'texts' ? texts.length
          : bookmarks.length;
  countBadge.textContent = `${n} / ${settings.maxScreenshots}`;
}

function setNativeStatus(connected) {
  if (!statusDot) return;
  statusDot.classList.toggle('connected', !!connected);
  statusDot.title = connected
    ? 'Companion connected — capturing screenshots system-wide'
    : 'Companion not connected — open the popup to capture, or run native-host/install.sh';
}

// The clipboard read can be rejected if it fires before the popup has focus, so
// retry silently on focus and after short delays until one read succeeds.
function autoCapture() {
  if (autoCaptured) return;
  captureFromClipboard({ userInitiated: false });
}
window.addEventListener('focus', autoCapture);
setTimeout(autoCapture, 200);
setTimeout(autoCapture, 600);

// ── Manual paste triggers (reliable: a click is a user gesture) ─────────────
pasteBtn.addEventListener('click', () => captureFromClipboard({ userInitiated: true }));
emptyPasteBtn.addEventListener('click', () => captureFromClipboard({ userInitiated: true }));

// ── Settings toggle ───────────────────────────────────────────────────────
settingsBtn.addEventListener('click', () => {
  const open = settingsPanel.classList.toggle('open');
  settingsBtn.classList.toggle('active', open);
  if (open) closeCalendar();
});

// ── Calendar ────────────────────────────────────────────────────────────────
let calYear, calMonth;

function initCalendar() {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
  calChipLabel.textContent =
    now.toLocaleDateString([], { weekday: 'short' }) + ', ' +
    now.getDate() + ' ' +
    now.toLocaleDateString([], { month: 'long' });
  renderCalendar();
}

function renderCalendar() {
  const now = new Date();
  const first = new Date(calYear, calMonth, 1);
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const startDow = first.getDay();

  calTitle.textContent = first.toLocaleDateString([], { month: 'long', year: 'numeric' });
  calDays.innerHTML = '';

  for (let i = 0; i < startDow; i++) {
    const blank = document.createElement('span');
    blank.className = 'cal-cell empty';
    calDays.appendChild(blank);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const cell = document.createElement('span');
    cell.className = 'cal-cell';
    cell.textContent = d;
    if (d === now.getDate() && calMonth === now.getMonth() && calYear === now.getFullYear()) {
      cell.classList.add('today');
    }
    calDays.appendChild(cell);
  }
}

function closeCalendar() {
  calPanel.hidden = true;
  calChip.classList.remove('active');
}

calChip.addEventListener('click', (e) => {
  e.stopPropagation();
  const willOpen = calPanel.hidden;
  calPanel.hidden = !willOpen;
  calChip.classList.toggle('active', willOpen);
  if (willOpen) {
    settingsPanel.classList.remove('open');
    settingsBtn.classList.remove('active');
    renderCalendar();
  }
});
calPrev.addEventListener('click', () => {
  if (--calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
});
calNext.addEventListener('click', () => {
  if (++calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
});
calToday.addEventListener('click', () => {
  const n = new Date();
  calYear = n.getFullYear();
  calMonth = n.getMonth();
  renderCalendar();
});
document.addEventListener('click', (e) => {
  if (!calPanel.hidden && !calPanel.contains(e.target) && !calChip.contains(e.target)) {
    closeCalendar();
  }
});

decrementBtn.addEventListener('click', () => {
  const v = parseInt(maxInput.value, 10);
  if (v > 1) maxInput.value = v - 1;
});

incrementBtn.addEventListener('click', () => {
  const v = parseInt(maxInput.value, 10);
  if (v < 50) maxInput.value = v + 1;
});

saveSettingsBtn.addEventListener('click', async () => {
  const max = Math.max(1, Math.min(50, parseInt(maxInput.value, 10) || 10));
  maxInput.value = max;
  settings = { maxScreenshots: max };
  await send('SAVE_SETTINGS', { settings });
  updateCountBadge();
  settingsPanel.classList.remove('open');
  settingsBtn.classList.remove('active');
  showToast('Settings saved');
});

clearAllBtn.addEventListener('click', async () => {
  if (activeTab === 'snaps') {
    if (!confirm('Delete all saved screenshots?')) return;
    await send('CLEAR_ALL');
    showToast('All screenshots cleared');
  } else if (activeTab === 'texts') {
    if (!confirm('Delete all saved texts?')) return;
    await send('CLEAR_TEXTS');
    showToast('All texts cleared');
  } else {
    if (!confirm('Delete all unpinned links? Pinned links are kept.')) return;
    await send('CLEAR_BOOKMARKS');
    showToast('Unpinned links cleared');
  }
});

// ── Clipboard capture ──────────────────────────────────────────────────────
// Reads the clipboard, saves any image found, and updates the UI in place.
// `userInitiated` (an explicit click) shows toast feedback; the automatic read
// on open is silent so it never nags with a banner or error.
async function captureFromClipboard({ userInitiated }) {
  if (capturing) return;
  capturing = true;

  try {
    if (!navigator.clipboard || !navigator.clipboard.read) {
      throw new Error('Clipboard API unavailable');
    }

    const items = await navigator.clipboard.read();
    // The clipboard was readable — stop the silent auto-capture retries.
    autoCaptured = true;
    let imageFound = false;

    for (const item of items) {
      const imageType = item.types.find(t => t.startsWith('image/'));
      if (!imageType) continue;
      imageFound = true;

      const blob    = await item.getType(imageType);
      const dataUrl = await blobToDataUrl(blob);
      const result  = await send('SAVE_SCREENSHOT', { dataUrl });

      if (result && result.success) {
        // storage.onChanged renders the new card.
        showToast('Screenshot added from clipboard');
      } else if (result && result.reason === 'duplicate') {
        if (userInitiated) showToast('That screenshot is already saved');
      }
      break;
    }

    if (!imageFound && userInitiated) {
      showToast('No image found on the clipboard');
    }
  } catch {
    // Read blocked (no focus / permission). Stay silent on the automatic path;
    // only give feedback when the user explicitly clicked paste.
    if (userInitiated) {
      showToast('Clipboard blocked — allow access and try again');
    }
  } finally {
    capturing = false;
  }
}

// ── Render (Snaps) ──────────────────────────────────────────────────────────
function renderGrid() {
  // Only newly-arrived items animate in; existing ones stay put on re-render.
  const known = new Set([...grid.children].map(c => c.dataset.id));
  grid.innerHTML = '';

  const hasItems = screenshots.length > 0;
  emptyState.style.display = hasItems ? 'none' : '';
  grid.style.display       = hasItems ? '' : 'none';

  screenshots.forEach((shot) => {
    grid.appendChild(buildCard(shot, !known.has(shot.id)));
  });
}

function buildCard(shot, isNew) {
  const template = document.getElementById('cardTemplate');
  const node     = template.content.cloneNode(true);
  const card     = node.querySelector('.card');

  card.dataset.id = shot.id;
  if (isNew) card.classList.add('entering');

  const img       = card.querySelector('.card-img');
  img.src         = shot.dataUrl;
  img.alt         = 'Screenshot ' + formatTime(shot.savedAt);

  card.querySelector('.time-text').textContent = formatTime(shot.savedAt);

  card.querySelectorAll('.view-trigger').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      openLightbox(shot);
    });
  });

  card.querySelector('.copy-btn').addEventListener('click', e => {
    e.stopPropagation();
    copyToClipboard(shot);
  });

  card.querySelector('.save-btn').addEventListener('click', e => {
    e.stopPropagation();
    downloadImage(shot);
  });

  card.querySelector('.delete-btn').addEventListener('click', e => {
    e.stopPropagation();
    deleteScreenshot(shot.id);
  });

  return card;
}

// ── Render (Texts) ──────────────────────────────────────────────────────────
function renderTexts() {
  const known = new Set([...textList.children].map(c => c.dataset.id));
  textList.innerHTML = '';

  const hasItems = texts.length > 0;
  emptyStateTexts.style.display = hasItems ? 'none' : '';
  textList.style.display        = hasItems ? '' : 'none';

  texts.forEach((entry) => {
    textList.appendChild(buildTextCard(entry, !known.has(entry.id)));
  });
}

function buildTextCard(entry, isNew) {
  const template = document.getElementById('textCardTemplate');
  const node     = template.content.cloneNode(true);
  const item     = node.querySelector('.text-item');

  item.dataset.id = entry.id;
  if (isNew) item.classList.add('entering');

  item.querySelector('.text-content').textContent = entry.text;
  item.querySelector('.text-time').textContent = formatTime(entry.savedAt);

  item.querySelector('.text-body').addEventListener('click', () => copyText(entry));

  item.querySelector('.text-delete-btn').addEventListener('click', e => {
    e.stopPropagation();
    deleteText(entry.id);
  });

  return item;
}

// ── Render (Links / Bookmarks) ────────────────────────────────────────────────
function renderLinks() {
  const known = new Set([...linkList.children].map(c => c.dataset.id));
  linkList.innerHTML = '';

  const hasItems = bookmarks.length > 0;
  emptyStateLinks.style.display = hasItems ? 'none' : '';
  linkList.style.display        = hasItems ? '' : 'none';

  // Pinned links float to the top.
  const ordered = [...bookmarks].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  ordered.forEach((entry) => {
    linkList.appendChild(buildBookmarkCard(entry, !known.has(entry.id)));
  });
}

function buildBookmarkCard(entry, isNew) {
  const template = document.getElementById('bookmarkTemplate');
  const node     = template.content.cloneNode(true);
  const item     = node.querySelector('.link-item');

  item.dataset.id = entry.id;
  if (isNew) item.classList.add('entering');
  item.classList.toggle('pinned', !!entry.pinned);

  item.querySelector('.link-url').textContent = prettyUrl(entry.url);
  item.querySelector('.text-time').textContent = formatTime(entry.savedAt);

  const pinBtn = item.querySelector('.link-pin-btn');
  pinBtn.title = entry.pinned ? 'Unpin' : 'Pin';
  pinBtn.classList.toggle('active', !!entry.pinned);

  item.querySelector('.link-body').addEventListener('click', () => copyBookmark(entry));
  pinBtn.addEventListener('click', e => { e.stopPropagation(); toggleBookmarkPin(entry.id); });
  item.querySelector('.link-open-btn').addEventListener('click', e => {
    e.stopPropagation();
    openBookmark(entry);
  });
  item.querySelector('.link-delete-btn').addEventListener('click', e => {
    e.stopPropagation();
    deleteBookmark(entry.id);
  });

  return item;
}

function prettyUrl(url) {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url);
    const path = (u.pathname + u.search).replace(/\/$/, '');
    return u.hostname.replace(/^www\./, '') + path;
  } catch {
    return url;
  }
}

// ── Actions (Snaps) ─────────────────────────────────────────────────────────
async function copyToClipboard(shot) {
  try {
    const res  = await fetch(shot.dataUrl);
    const blob = await res.blob();
    await navigator.clipboard.write([
      new ClipboardItem({ [blob.type]: blob })
    ]);
    showToast('Copied to clipboard!');
  } catch {
    showToast('Copy failed — check clipboard permission');
  }
}

function downloadImage(shot) {
  const a    = document.createElement('a');
  a.href     = shot.dataUrl;
  a.download = `screenshot-${shot.savedAt}.png`;
  a.click();
  showToast('Saving image...');
}

async function deleteScreenshot(id) {
  if (currentShot && currentShot.id === id) closeLightbox();
  await send('DELETE_SCREENSHOT', { id }); // storage.onChanged re-renders.
}

// ── Actions (Texts) ─────────────────────────────────────────────────────────
async function copyText(entry) {
  try {
    await navigator.clipboard.writeText(entry.text);
    // Don't re-capture what we just wrote back to the clipboard.
    lastTextSeen = entry.text;
    showToast('Text copied to clipboard!');
  } catch {
    showToast('Copy failed — check clipboard permission');
  }
}

async function deleteText(id) {
  await send('DELETE_TEXT', { id }); // storage.onChanged re-renders.
}

// ── Actions (Links / Bookmarks) ──────────────────────────────────────────────
async function copyBookmark(entry) {
  try {
    await navigator.clipboard.writeText(entry.url);
    lastTextSeen = entry.url;
    showToast('Link copied to clipboard!');
  } catch {
    showToast('Copy failed — check clipboard permission');
  }
}

function openBookmark(entry) {
  const url = /^https?:\/\//i.test(entry.url) ? entry.url : 'https://' + entry.url;
  window.open(url, '_blank', 'noopener');
}

async function toggleBookmarkPin(id) {
  await send('TOGGLE_BOOKMARK_PIN', { id }); // storage.onChanged re-renders.
}

async function deleteBookmark(id) {
  await send('DELETE_BOOKMARK', { id }); // storage.onChanged re-renders.
}

// Pull text sitting on the clipboard when the popup opens (covers text copied
// in another app when no content script / companion saw it).
async function captureTextFromClipboard() {
  try {
    if (!navigator.clipboard || !navigator.clipboard.readText) return;
    const text = await navigator.clipboard.readText();
    const value = (text || '').trim();
    if (!value || value === lastTextSeen) return;
    lastTextSeen = value;
    await send('SAVE_TEXT', { text: value });
  } catch { /* not focused / denied / no text — ignore */ }
}
window.addEventListener('focus', captureTextFromClipboard);

// ── Lightbox / Preview ─────────────────────────────────────────────────────
let currentShot = null;

function openLightbox(shot) {
  currentShot = shot;
  lightboxImg.src = shot.dataUrl;
  lightboxTime.textContent = formatTime(shot.savedAt);
  lightbox.classList.add('open');
  lightbox.setAttribute('aria-hidden', 'false');
}

function closeLightbox() {
  lightbox.classList.remove('open');
  lightbox.setAttribute('aria-hidden', 'true');
  currentShot = null;
  lightboxImg.removeAttribute('src');
}

lightboxClose.addEventListener('click', closeLightbox);
lightboxBackdrop.addEventListener('click', closeLightbox);
lightboxCopy.addEventListener('click', () => { if (currentShot) copyToClipboard(currentShot); });
lightboxSave.addEventListener('click', () => { if (currentShot) downloadImage(currentShot); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && lightbox.classList.contains('open')) closeLightbox();
});

// ── Toast ─────────────────────────────────────────────────────────────────
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2000);
}

// ── Helpers ───────────────────────────────────────────────────────────────
function send(type, extra = {}) {
  return chrome.runtime.sendMessage({ type, ...extra });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  if (isToday) {
    return time;
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time;
}
