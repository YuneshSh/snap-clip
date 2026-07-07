const $ = id => document.getElementById(id);

const settingsBtn    = $('settingsBtn');
const settingsPanel  = $('settingsPanel');
const maxInput       = $('maxInput');
const decrementBtn   = $('decrementBtn');
const incrementBtn   = $('incrementBtn');
const saveSettingsBtn= $('saveSettingsBtn');
const clearAllBtn    = $('clearAllBtn');
const themeSwatches  = $('themeSwatches');
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
const calNotesDate   = $('calNotesDate');
const calNotesList   = $('calNotesList');
const calNoteInput   = $('calNoteInput');
const calNoteAddBtn  = $('calNoteAddBtn');
const ticker         = $('ticker');
const tickerTrack    = $('tickerTrack');
const pinnedDrawer   = $('pinnedDrawer');
const pinnedToggle   = $('pinnedToggle');
const pinnedList     = $('pinnedList');
const pinnedCount    = $('pinnedCount');
const pinnedTitle    = $('pinnedTitle');

let screenshots   = [];
let texts         = [];
let bookmarks     = [];
let notes         = [];
let settings      = { maxScreenshots: 10, theme: 'ocean' };
let activeTab     = 'snaps';
let pinnedExpanded= false;
let toastTimer    = null;
let capturing     = false;
let autoCaptured  = false;
let lastTextSeen  = null;

const POPUP_WIDTH  = 520;
const POPUP_HEIGHT = 600;

/** Chrome may resize the popup when tab content changes — lock dimensions explicitly. */
function lockPopupSize() {
  const w = `${POPUP_WIDTH}px`;
  const h = `${POPUP_HEIGHT}px`;
  document.documentElement.style.width = w;
  document.documentElement.style.minWidth = w;
  document.documentElement.style.maxWidth = w;
  document.documentElement.style.height = h;
  document.documentElement.style.minHeight = h;
  document.documentElement.style.maxHeight = h;
  document.body.style.width = w;
  document.body.style.minWidth = w;
  document.body.style.maxWidth = w;
  document.body.style.height = h;
  document.body.style.minHeight = h;
  document.body.style.maxHeight = h;
}

// ── Init ──────────────────────────────────────────────────────────────────
lockPopupSize();
(async () => {
  [settings, screenshots, texts, bookmarks, notes] = await Promise.all([
    send('GET_SETTINGS'),
    send('GET_SCREENSHOTS'),
    send('GET_TEXTS'),
    send('GET_BOOKMARKS'),
    send('GET_NOTES')
  ]);
  notes = notes || [];
  texts = (texts || []).map(t => ({ pinned: false, ...t }));
  bookmarks = (bookmarks || []).map(b => ({ pinned: false, ...b }));
  maxInput.value = settings.maxScreenshots;
  applyTheme(settings.theme);
  renderGrid();
  renderTexts();
  renderLinks();
  updateCountBadge();
  updatePinnedDrawer();
  initCalendar();
  renderTicker();
  lockPopupSize();

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
    texts = (changes.texts.newValue || []).map(t => ({ pinned: false, ...t }));
    renderTexts();
  }
  if (changes.bookmarks) {
    bookmarks = (changes.bookmarks.newValue || []).map(b => ({ pinned: false, ...b }));
    renderLinks();
  }
  if (changes.notes) {
    notes = changes.notes.newValue || [];
    renderCalendar();
    renderCalNotes();
    renderTicker();
  }
  if (changes.texts || changes.bookmarks) updatePinnedDrawer();
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
  pinnedExpanded = false;
  for (const [name, { btn, panel }] of Object.entries(TABS)) {
    const on = name === tab;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', String(on));
    panel.hidden = !on;
  }
  updateCountBadge();
  updatePinnedDrawer();
  lockPopupSize();
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
function dateKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Initialise synchronously so the grid renders even if the popup opens before
// the async storage fetch finishes (avoids an empty month with no date cells).
const _bootNow = new Date();
let calYear = _bootNow.getFullYear();
let calMonth = _bootNow.getMonth();
let selectedDate = dateKey(_bootNow.getFullYear(), _bootNow.getMonth(), _bootNow.getDate());

function ensureCalState() {
  if (!Number.isFinite(calYear) || !Number.isFinite(calMonth)) {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
  }
  if (!selectedDate) {
    const now = new Date();
    selectedDate = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
  }
}

function initCalendar() {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
  selectedDate = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
  if (calChipLabel) {
    calChipLabel.textContent =
      now.toLocaleDateString([], { weekday: 'short' }) + ', ' +
      now.getDate() + ' ' +
      now.toLocaleDateString([], { month: 'long' });
  }
  renderCalendar();
  renderCalNotes();
}

function renderCalendar() {
  if (!calDays || !calTitle) return;
  ensureCalState();

  const now = new Date();
  const first = new Date(calYear, calMonth, 1);
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const startDow = first.getDay();
  const noteDates = new Set((notes || []).map(n => n.date));

  calTitle.textContent = first.toLocaleDateString([], { month: 'long', year: 'numeric' });
  calDays.innerHTML = '';

  for (let i = 0; i < startDow; i++) {
    const blank = document.createElement('span');
    blank.className = 'cal-cell empty';
    calDays.appendChild(blank);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const key = dateKey(calYear, calMonth, d);
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cal-cell';
    cell.textContent = d;
    if (d === now.getDate() && calMonth === now.getMonth() && calYear === now.getFullYear()) {
      cell.classList.add('today');
    }
    if (key === selectedDate) cell.classList.add('selected');
    if (noteDates.has(key)) cell.classList.add('has-note');
    cell.dataset.date = key;
    cell.addEventListener('click', (e) => {
      e.stopPropagation();
      selectDate(key);
    });
    calDays.appendChild(cell);
  }
}

function selectDate(key) {
  selectedDate = key;
  // Update the selected ring without rebuilding the grid (rebuilding detaches
  // the clicked cell and makes the document "click outside" handler close us).
  calDays.querySelectorAll('button.cal-cell[data-date]').forEach(cell => {
    cell.classList.toggle('selected', cell.dataset.date === key);
  });
  renderCalNotes();
  if (calNoteInput) calNoteInput.focus();
}

function renderCalNotes() {
  if (!selectedDate) {
    calNotesDate.textContent = 'Pick a date';
    calNotesList.innerHTML = '';
    return;
  }
  const [y, m, d] = selectedDate.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  calNotesDate.textContent = dateObj.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'long' });

  const dayNotes = (notes || []).filter(n => n.date === selectedDate);
  calNotesList.innerHTML = '';

  if (dayNotes.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'cal-notes-empty';
    empty.textContent = 'No notes for this day yet.';
    calNotesList.appendChild(empty);
    return;
  }
  dayNotes.forEach(n => {
    const row = document.createElement('div');
    row.className = 'cal-note';

    const dot = document.createElement('span');
    dot.className = 'cal-note-bullet';

    const span = document.createElement('span');
    span.className = 'cal-note-text';
    span.textContent = n.text;

    const del = document.createElement('button');
    del.className = 'cal-note-del';
    del.title = 'Delete note';
    del.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteNote(n.id);
    });

    row.appendChild(dot);
    row.appendChild(span);
    row.appendChild(del);
    calNotesList.appendChild(row);
  });
}

async function addNoteForSelected() {
  ensureCalState();
  const text = (calNoteInput.value || '').trim();
  if (!selectedDate || !text) return;
  calNoteInput.value = '';
  try {
    const res = await send('ADD_NOTE', { date: selectedDate, text });
    if (!res || !res.success) {
      showToast('Could not save note');
      calNoteInput.value = text;
      return;
    }
    if (res.entry && !(notes || []).some(n => n.id === res.entry.id)) {
      notes = [...(notes || []), res.entry];
    }
    renderCalendar();
    renderCalNotes();
    renderTicker();
    showToast('Reminder saved');
  } catch {
    showToast('Could not save note');
    calNoteInput.value = text;
  }
}

async function deleteNote(id) {
  await send('DELETE_NOTE', { id });
  notes = (notes || []).filter(n => n.id !== id);
  renderCalendar();
  renderCalNotes();
  renderTicker();
}

calNoteAddBtn.addEventListener('click', addNoteForSelected);
calNoteInput.addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') addNoteForSelected();
});

// ── Today's reminders ticker ──────────────────────────────────────────────────
function renderTicker() {
  if (!ticker || !tickerTrack) return;

  const now = new Date();
  const todayKey = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
  const todays = (notes || []).filter(n => n.date === todayKey);

  if (todays.length === 0) {
    ticker.hidden = true;
    tickerTrack.innerHTML = '';
    return;
  }
  ticker.hidden = false;
  ticker.removeAttribute('hidden');

  const sentence = todays.map(n => n.text).join('     \u2022     ') + '     \u2022     ';
  tickerTrack.innerHTML = '';
  // Two identical copies so the left→right scroll loops seamlessly.
  for (let i = 0; i < 2; i++) {
    const span = document.createElement('span');
    span.className = 'ticker-item';
    span.textContent = sentence;
    tickerTrack.appendChild(span);
  }
  const dur = Math.max(14, Math.min(48, sentence.length * 0.45));
  tickerTrack.style.animationDuration = dur + 's';
}

// Click the ticker to jump straight to today's notes in the calendar.
if (ticker) {
  ticker.addEventListener('click', () => {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
    selectedDate = dateKey(now.getFullYear(), now.getMonth(), now.getDate());
    settingsPanel.classList.remove('open');
    settingsBtn.classList.remove('active');
    calPanel.hidden = false;
    calChip.classList.add('active');
    renderCalendar();
    renderCalNotes();
    calNoteInput.focus();
  });
}

// ── Pinned drawer (Texts / Links) ─────────────────────────────────────────────
function updatePinnedDrawer() {
  if (!pinnedDrawer) return;
  if (activeTab === 'snaps') { pinnedDrawer.hidden = true; return; }

  const isTexts = activeTab === 'texts';
  const items = (isTexts ? texts : bookmarks).filter(i => !!i.pinned);

  pinnedDrawer.hidden = false;
  pinnedDrawer.removeAttribute('hidden');
  pinnedTitle.textContent = isTexts ? 'Pinned texts' : 'Pinned links';
  pinnedCount.textContent = items.length;
  pinnedDrawer.classList.toggle('open', pinnedExpanded);
  pinnedToggle.setAttribute('aria-expanded', String(pinnedExpanded));
  pinnedList.hidden = !pinnedExpanded;

  if (pinnedExpanded) {
    pinnedList.innerHTML = '';
    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'pinned-empty';
      empty.textContent = isTexts
        ? 'No pinned texts yet — tap the pin icon on any text.'
        : 'No pinned links yet — tap the pin icon on any link.';
      pinnedList.appendChild(empty);
    } else {
      items.forEach(entry => {
        pinnedList.appendChild(isTexts ? buildPinnedTextCard(entry) : buildBookmarkCard(entry, false));
      });
    }
  }
}

pinnedToggle.addEventListener('click', () => {
  pinnedExpanded = !pinnedExpanded;
  updatePinnedDrawer();
});

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
    ensureCalState();
    renderCalendar();
    renderCalNotes();
  }
});
calPrev.addEventListener('click', (e) => {
  e.stopPropagation();
  if (--calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
});
calNext.addEventListener('click', (e) => {
  e.stopPropagation();
  if (++calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
});
calToday.addEventListener('click', (e) => {
  e.stopPropagation();
  const n = new Date();
  calYear = n.getFullYear();
  calMonth = n.getMonth();
  selectedDate = dateKey(n.getFullYear(), n.getMonth(), n.getDate());
  renderCalendar();
  renderCalNotes();
});

// Clicks inside the calendar must not bubble to the document-level closer.
if (calPanel) {
  calPanel.addEventListener('click', (e) => e.stopPropagation());
  calPanel.addEventListener('mousedown', (e) => e.stopPropagation());
}

document.addEventListener('click', (e) => {
  if (calPanel.hidden) return;
  const path = e.composedPath ? e.composedPath() : [e.target];
  if (path.includes(calPanel) || path.includes(calChip)) return;
  closeCalendar();
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
  settings = { ...settings, maxScreenshots: max };
  await send('SAVE_SETTINGS', { settings });
  updateCountBadge();
  settingsPanel.classList.remove('open');
  settingsBtn.classList.remove('active');
  showToast('Settings saved');
});

// ── Accent color palettes ─────────────────────────────────────────────────────
const THEMES = ['ocean', 'violet', 'fuchsia', 'mint', 'sunset', 'coral', 'indigo', 'aurora'];

function applyTheme(theme) {
  const t = THEMES.includes(theme) ? theme : 'ocean';
  document.documentElement.dataset.theme = t;
  if (!themeSwatches) return;
  themeSwatches.querySelectorAll('.swatch').forEach(s => {
    const on = s.dataset.theme === t;
    s.classList.toggle('selected', on);
    s.setAttribute('aria-checked', String(on));
  });
}

if (themeSwatches) {
  themeSwatches.addEventListener('click', async (e) => {
    const btn = e.target.closest('.swatch');
    if (!btn) return;
    const theme = btn.dataset.theme;
    settings = { ...settings, theme };
    applyTheme(theme);
    await send('SAVE_SETTINGS', { settings });
    showToast('Accent color updated');
  });
}

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

  // Pinned entries live in the docked bottom drawer, not the main list.
  const unpinned = texts.filter(t => !t.pinned);
  const hasAny = texts.length > 0;
  emptyStateTexts.style.display = hasAny ? 'none' : '';
  textList.style.display        = unpinned.length ? '' : 'none';

  unpinned.forEach((entry) => {
    textList.appendChild(buildTextCard(entry, !known.has(entry.id)));
  });
}

function buildTextCard(entry, isNew) {
  const template = document.getElementById('textCardTemplate');
  const node     = template.content.cloneNode(true);
  const item     = node.querySelector('.text-item');

  item.dataset.id = entry.id;
  if (isNew) item.classList.add('entering');
  item.classList.toggle('pinned', !!entry.pinned);

  item.querySelector('.text-content').textContent = entry.text;
  item.querySelector('.text-time').textContent = formatTime(entry.savedAt);

  const pinBtn = item.querySelector('.text-pin-btn');
  pinBtn.title = entry.pinned ? 'Unpin' : 'Pin';
  pinBtn.classList.toggle('active', !!entry.pinned);

  item.querySelector('.text-body').addEventListener('click', () => copyText(entry));
  pinBtn.addEventListener('click', e => { e.stopPropagation(); toggleTextPin(entry.id); });
  item.querySelector('.text-delete-btn').addEventListener('click', e => {
    e.stopPropagation();
    deleteText(entry.id);
  });

  return item;
}

function buildPinnedTextCard(entry) {
  const template = document.getElementById('pinnedTextTemplate');
  const node     = template.content.cloneNode(true);
  const item     = node.querySelector('.pinned-text-item');

  item.dataset.id = entry.id;
  item.querySelector('.pinned-text-content').textContent = entry.text;

  item.querySelector('.pinned-text-copy').addEventListener('click', () => copyText(entry));
  item.querySelector('.pinned-mini-copy').addEventListener('click', e => {
    e.stopPropagation();
    copyText(entry);
  });
  item.querySelector('.text-pin-btn').addEventListener('click', e => {
    e.stopPropagation();
    toggleTextPin(entry.id);
  });
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

  // Pinned links live in the docked bottom drawer, not the main list.
  const unpinned = bookmarks.filter(b => !b.pinned);
  const hasAny = bookmarks.length > 0;
  emptyStateLinks.style.display = hasAny ? 'none' : '';
  linkList.style.display        = unpinned.length ? '' : 'none';

  unpinned.forEach((entry) => {
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

async function toggleTextPin(id) {
  const entry = texts.find(t => t.id === id);
  if (!entry) return;
  const willPin = !Boolean(entry.pinned);

  try {
    const res = await send('TOGGLE_TEXT_PIN', { id });
    if (res && res.success === false) {
      showToast('Could not pin text');
      return;
    }
    texts = texts.map(t => t.id === id ? { ...t, pinned: willPin } : t);
    if (willPin) pinnedExpanded = true;
    renderTexts();
    updatePinnedDrawer();
    showToast(willPin ? 'Pinned — see Pinned texts below' : 'Text unpinned');
  } catch {
    showToast('Could not pin text');
  }
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
  const entry = bookmarks.find(b => b.id === id);
  if (!entry) return;
  const willPin = !Boolean(entry.pinned);

  try {
    const res = await send('TOGGLE_BOOKMARK_PIN', { id });
    if (res && res.success === false) {
      showToast('Could not pin link');
      return;
    }
    bookmarks = bookmarks.map(b => b.id === id ? { ...b, pinned: willPin } : b);
    if (willPin) pinnedExpanded = true;
    renderLinks();
    updatePinnedDrawer();
    showToast(willPin ? 'Pinned — see Pinned links below' : 'Link unpinned');
  } catch {
    showToast('Could not pin link');
  }
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
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ type, ...extra }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    } catch (err) {
      reject(err);
    }
  });
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

// Paint the month grid immediately — don't wait for the async storage fetch.
renderCalendar();
