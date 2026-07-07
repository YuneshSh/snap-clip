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
const tabNotes       = $('tabNotes');
const snapsPanel     = $('snapsPanel');
const textsPanel     = $('textsPanel');
const linksPanel     = $('linksPanel');
const notesPanel     = $('notesPanel');
const noteComposer   = $('noteComposer');
const textList       = $('textList');
const linkList       = $('linkList');
const noteList       = $('noteList');
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
const toastMsg       = $('toastMsg');
const toastAction    = $('toastAction');
const textSearchInput= $('textSearchInput');
const textSortSelect = $('textSortSelect');
const textSelectBtn  = $('textSelectBtn');
const textBulkDeleteBtn = $('textBulkDeleteBtn');
const emptyStateTextsFiltered = $('emptyStateTextsFiltered');
const linkSearchInput= $('linkSearchInput');
const linkSortSelect = $('linkSortSelect');
const linkSelectBtn  = $('linkSelectBtn');
const linkBulkDeleteBtn = $('linkBulkDeleteBtn');
const emptyStateLinksFiltered = $('emptyStateLinksFiltered');
const snapSelectBtn  = $('snapSelectBtn');
const snapBulkDeleteBtn = $('snapBulkDeleteBtn');
const noteTitleInput = $('noteTitleInput');
const noteBodyInput  = $('noteBodyInput');
const noteSaveBtn    = $('noteSaveBtn');
const noteCancelEditBtn = $('noteCancelEditBtn');
const noteComposerLabel = $('noteComposerLabel');
const noteSearchInput= $('noteSearchInput');
const noteSortSelect = $('noteSortSelect');
const noteSelectBtn  = $('noteSelectBtn');
const noteBulkDeleteBtn = $('noteBulkDeleteBtn');
const emptyStateNotes = $('emptyStateNotes');
const emptyStateNotesFiltered = $('emptyStateNotesFiltered');
const lightboxImgwrap = document.querySelector('.lightbox-imgwrap');
const lightboxCanvas = $('lightboxCanvas');
const lightboxCanvasStack = $('lightboxCanvasStack');
const annotatePen    = $('annotatePen');
const annotateArrow  = $('annotateArrow');
const annotateText   = $('annotateText');
const annotateMove   = $('annotateMove');
const annotateUndo   = $('annotateUndo');
const annotateSave   = $('annotateSave');

let screenshots   = [];
let texts         = [];
let bookmarks     = [];
let notes         = [];
let quickNotes    = [];
let settings      = { maxScreenshots: 10, theme: 'ocean' };
let activeTab     = 'snaps';
let pinnedExpanded= false;
let toastTimer    = null;
let capturing     = false;
let autoCaptured  = false;
let lastTextSeen  = null;

let textSearchQuery = '';
let textSortOrder   = 'newest';
let linkSearchQuery = '';
let linkSortOrder   = 'newest';
let noteSearchQuery = '';
let noteSortOrder   = 'newest';
let textSelectMode  = false;
let linkSelectMode  = false;
let snapSelectMode  = false;
let noteSelectMode  = false;
let editingNoteId   = null;
let selectedTextIds = new Set();
let selectedLinkIds = new Set();
let selectedSnapIds = new Set();
let selectedNoteIds = new Set();
let undoPending     = null;
let undoTimer       = null;

const UNDO_MS = 8000;

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
  [settings, screenshots, texts, bookmarks, notes, quickNotes] = await Promise.all([
    send('GET_SETTINGS'),
    send('GET_SCREENSHOTS'),
    send('GET_TEXTS'),
    send('GET_BOOKMARKS'),
    send('GET_NOTES'),
    send('GET_QUICK_NOTES')
  ]);
  notes = notes || [];
  quickNotes = (quickNotes || []).map(n => ({ pinned: false, title: '', ...n }));
  texts = (texts || []).map(t => ({ pinned: false, ...t }));
  bookmarks = (bookmarks || []).map(b => ({ pinned: false, ...b }));
  maxInput.value = settings.maxScreenshots;
  applyTheme(settings.theme);
  renderGrid();
  renderTexts();
  renderLinks();
  renderNotes();
  updateCountBadge();
  updatePinnedDrawer();
  initCalendar();
  renderTicker();
  lockPopupSize();
  backfillLinkPreviews();

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
  if (changes.quickNotes) {
    quickNotes = (changes.quickNotes.newValue || []).map(n => ({ pinned: false, title: '', ...n }));
    renderNotes();
  }
  if (changes.notes) {
    notes = changes.notes.newValue || [];
    renderCalendar();
    renderCalNotes();
    renderTicker();
  }
  if (changes.texts || changes.bookmarks || changes.quickNotes) updatePinnedDrawer();
  if (changes.screenshots || changes.texts || changes.bookmarks || changes.quickNotes) updateCountBadge();
});

// ── Tabs ────────────────────────────────────────────────────────────────────
const TABS = {
  snaps: { btn: tabSnaps, panel: snapsPanel },
  texts: { btn: tabTexts, panel: textsPanel },
  links: { btn: tabLinks, panel: linksPanel },
  notes: { btn: tabNotes, panel: notesPanel }
};

function switchTab(tab) {
  activeTab = tab;
  pinnedExpanded = false;
  exitSelectionMode('texts');
  exitSelectionMode('links');
  exitSelectionMode('snaps');
  exitSelectionMode('notes');
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
tabNotes.addEventListener('click', () => switchTab('notes'));

function updateCountBadge() {
  const n = activeTab === 'snaps' ? screenshots.length
          : activeTab === 'texts' ? texts.length
          : activeTab === 'notes' ? quickNotes.length
          : bookmarks.length;
  countBadge.textContent = `${n} / ${settings.maxScreenshots}`;
}

function setNativeStatus(connected) {
  if (!statusDot) return;
  statusDot.classList.toggle('connected', !!connected);
  statusDot.title = connected
    ? 'Companion connected — capturing screenshots system-wide'
    : 'Companion not connected — open the popup to capture, or install the native host (see native-host/README.md)';
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
  const isNotes = activeTab === 'notes';
  const items = isTexts ? texts.filter(i => !!i.pinned)
    : isNotes ? quickNotes.filter(i => !!i.pinned)
    : bookmarks.filter(i => !!i.pinned);

  pinnedDrawer.hidden = false;
  pinnedDrawer.removeAttribute('hidden');
  pinnedTitle.textContent = isTexts ? 'Pinned texts' : isNotes ? 'Pinned notes' : 'Pinned links';
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
        : isNotes
          ? 'No pinned notes yet — tap the pin icon on any note.'
          : 'No pinned links yet — tap the pin icon on any link.';
      pinnedList.appendChild(empty);
    } else {
      items.forEach(entry => {
        pinnedList.appendChild(
          isTexts ? buildPinnedTextCard(entry)
            : isNotes ? buildPinnedNoteCard(entry)
            : buildBookmarkCard(entry, false)
        );
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
  } else if (activeTab === 'notes') {
    if (!confirm('Delete all unpinned notes? Pinned notes are kept.')) return;
    await send('CLEAR_QUICK_NOTES');
    showToast('Unpinned notes cleared');
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
  const known = new Set([...grid.children].map(c => c.dataset.id));
  grid.innerHTML = '';

  const hasItems = screenshots.length > 0;
  emptyState.style.display = hasItems ? 'none' : '';
  grid.style.display       = hasItems ? '' : 'none';
  if ($('snapsToolbar')) $('snapsToolbar').style.display = hasItems ? '' : 'none';

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
      if (snapSelectMode) return;
      openLightbox(shot);
    });
  });

  card.querySelector('.copy-btn').addEventListener('click', e => {
    e.stopPropagation();
    if (snapSelectMode) return;
    copyToClipboard(shot);
  });

  card.querySelector('.save-btn').addEventListener('click', e => {
    e.stopPropagation();
    if (snapSelectMode) return;
    downloadImage(shot);
  });

  card.querySelector('.delete-btn').addEventListener('click', e => {
    e.stopPropagation();
    deleteScreenshot(shot.id);
  });

  if (snapSelectMode) wireItemSelection(card, shot, 'snaps');

  return card;
}

// ── Search, filter, selection, undo ─────────────────────────────────────────
function sortBySavedAt(items, order) {
  const sorted = [...items];
  sorted.sort((a, b) => order === 'oldest' ? a.savedAt - b.savedAt : b.savedAt - a.savedAt);
  return sorted;
}

function filterTexts(items) {
  const q = textSearchQuery.trim().toLowerCase();
  if (!q) return items;
  return items.filter(t => (t.text || '').toLowerCase().includes(q));
}

function filterBookmarks(items) {
  const q = linkSearchQuery.trim().toLowerCase();
  if (!q) return items;
  return items.filter(b => {
    const hay = [b.url, b.title, prettyUrl(b.url)].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function filterNotes(items) {
  const q = noteSearchQuery.trim().toLowerCase();
  if (!q) return items;
  return items.filter(n => {
    const hay = [n.title, n.text].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function getVisibleTexts() {
  return sortBySavedAt(filterTexts(texts.filter(t => !t.pinned)), textSortOrder);
}

function getVisibleBookmarks() {
  return sortBySavedAt(filterBookmarks(bookmarks.filter(b => !b.pinned)), linkSortOrder);
}

function getVisibleNotes() {
  return sortBySavedAt(filterNotes(quickNotes.filter(n => !n.pinned)), noteSortOrder);
}

function updateBulkDeleteBtn(tab) {
  if (tab === 'texts') {
    const n = selectedTextIds.size;
    textBulkDeleteBtn.hidden = !textSelectMode || n === 0;
    textBulkDeleteBtn.textContent = n ? `Delete (${n})` : 'Delete';
  } else if (tab === 'links') {
    const n = selectedLinkIds.size;
    linkBulkDeleteBtn.hidden = !linkSelectMode || n === 0;
    linkBulkDeleteBtn.textContent = n ? `Delete (${n})` : 'Delete';
  } else if (tab === 'snaps') {
    const n = selectedSnapIds.size;
    snapBulkDeleteBtn.hidden = !snapSelectMode || n === 0;
    snapBulkDeleteBtn.textContent = n ? `Delete (${n})` : 'Delete';
  } else if (tab === 'notes') {
    const n = selectedNoteIds.size;
    noteBulkDeleteBtn.hidden = !noteSelectMode || n === 0;
    noteBulkDeleteBtn.textContent = n ? `Delete (${n})` : 'Delete';
  }
}

function enterSelectionMode(tab) {
  if (tab === 'texts') {
    textSelectMode = true;
    textSelectBtn.textContent = 'Cancel';
    textSelectBtn.classList.add('active');
    textList.classList.add('selection-mode');
  } else if (tab === 'links') {
    linkSelectMode = true;
    linkSelectBtn.textContent = 'Cancel';
    linkSelectBtn.classList.add('active');
    linkList.classList.add('selection-mode');
  } else if (tab === 'snaps') {
    snapSelectMode = true;
    snapSelectBtn.textContent = 'Cancel';
    snapSelectBtn.classList.add('active');
    grid.classList.add('selection-mode');
  } else if (tab === 'notes') {
    noteSelectMode = true;
    noteSelectBtn.textContent = 'Cancel';
    noteSelectBtn.classList.add('active');
    noteList.classList.add('selection-mode');
  }
  updateBulkDeleteBtn(tab);
  if (tab === 'texts') renderTexts();
  else if (tab === 'links') renderLinks();
  else if (tab === 'notes') renderNotes();
  else renderGrid();
}

function exitSelectionMode(tab) {
  if (tab === 'texts') {
    textSelectMode = false;
    selectedTextIds.clear();
    textSelectBtn.textContent = 'Select';
    textSelectBtn.classList.remove('active');
    textList.classList.remove('selection-mode');
    textBulkDeleteBtn.hidden = true;
  } else if (tab === 'links') {
    linkSelectMode = false;
    selectedLinkIds.clear();
    linkSelectBtn.textContent = 'Select';
    linkSelectBtn.classList.remove('active');
    linkList.classList.remove('selection-mode');
    linkBulkDeleteBtn.hidden = true;
  } else if (tab === 'snaps') {
    snapSelectMode = false;
    selectedSnapIds.clear();
    snapSelectBtn.textContent = 'Select';
    snapSelectBtn.classList.remove('active');
    grid.classList.remove('selection-mode');
    snapBulkDeleteBtn.hidden = true;
  } else if (tab === 'notes') {
    noteSelectMode = false;
    selectedNoteIds.clear();
    noteSelectBtn.textContent = 'Select';
    noteSelectBtn.classList.remove('active');
    noteList.classList.remove('selection-mode');
    noteBulkDeleteBtn.hidden = true;
  }
  if (tab === 'texts') renderTexts();
  else if (tab === 'links') renderLinks();
  else if (tab === 'notes') renderNotes();
  else renderGrid();
}

function toggleSelectionMode(tab) {
  if (tab === 'texts') {
    if (textSelectMode) exitSelectionMode('texts');
    else enterSelectionMode('texts');
  } else if (tab === 'links') {
    if (linkSelectMode) exitSelectionMode('links');
    else enterSelectionMode('links');
  } else if (tab === 'snaps') {
    if (snapSelectMode) exitSelectionMode('snaps');
    else enterSelectionMode('snaps');
  } else if (tab === 'notes') {
    if (noteSelectMode) exitSelectionMode('notes');
    else enterSelectionMode('notes');
  }
}

function wireItemSelection(item, entry, tab) {
  const cb = item.querySelector('.item-select');
  const set = tab === 'texts' ? selectedTextIds
    : tab === 'links' ? selectedLinkIds
    : tab === 'notes' ? selectedNoteIds
    : selectedSnapIds;
  cb.checked = set.has(entry.id);
  item.classList.toggle('selected', cb.checked);
  cb.addEventListener('change', () => {
    if (cb.checked) set.add(entry.id);
    else set.delete(entry.id);
    item.classList.toggle('selected', cb.checked);
    updateBulkDeleteBtn(tab);
  });
  cb.addEventListener('click', e => e.stopPropagation());
}

function clearUndo() {
  if (undoTimer) clearTimeout(undoTimer);
  undoTimer = null;
  undoPending = null;
  toastAction.hidden = true;
  toastAction.onclick = null;
  toast.classList.remove('interactive');
}

function scheduleUndo(payload) {
  clearUndo();
  undoPending = payload;
  undoTimer = setTimeout(clearUndo, UNDO_MS);
}

async function performUndo() {
  if (!undoPending) return;
  const { type, items } = undoPending;
  clearUndo();
  toast.classList.remove('show');
  if (type === 'texts') {
    await send('RESTORE_TEXTS', { items });
    showToast(items.length === 1 ? 'Text restored' : `${items.length} texts restored`);
  } else if (type === 'bookmarks') {
    await send('RESTORE_BOOKMARKS', { items });
    showToast(items.length === 1 ? 'Link restored' : `${items.length} links restored`);
  } else if (type === 'screenshots') {
    await send('RESTORE_SCREENSHOTS', { items });
    showToast(items.length === 1 ? 'Screenshot restored' : `${items.length} screenshots restored`);
  } else if (type === 'quickNotes') {
    await send('RESTORE_QUICK_NOTES', { items });
    showToast(items.length === 1 ? 'Note restored' : `${items.length} notes restored`);
  }
}

async function deleteScreenshotsWithUndo(ids) {
  const idSet = new Set(ids);
  const removed = screenshots.filter(s => idSet.has(s.id));
  if (!removed.length) return;
  if (currentShot && idSet.has(currentShot.id)) closeLightbox();
  await send('DELETE_SCREENSHOTS', { ids: [...idSet] });
  scheduleUndo({ type: 'screenshots', items: removed });
  const label = removed.length === 1 ? 'Screenshot deleted' : `${removed.length} screenshots deleted`;
  showToast(label, { undo: true });
  selectedSnapIds.clear();
  if (snapSelectMode) exitSelectionMode('snaps');
}

async function deleteTextsWithUndo(ids) {
  const idSet = new Set(ids);
  const removed = texts.filter(t => idSet.has(t.id));
  if (!removed.length) return;
  await send('DELETE_TEXTS', { ids: [...idSet] });
  scheduleUndo({ type: 'texts', items: removed });
  const label = removed.length === 1 ? 'Text deleted' : `${removed.length} texts deleted`;
  showToast(label, { undo: true });
  selectedTextIds.clear();
  if (textSelectMode) exitSelectionMode('texts');
}

async function deleteBookmarksWithUndo(ids) {
  const idSet = new Set(ids);
  const removed = bookmarks.filter(b => idSet.has(b.id));
  if (!removed.length) return;
  await send('DELETE_BOOKMARKS', { ids: [...idSet] });
  scheduleUndo({ type: 'bookmarks', items: removed });
  const label = removed.length === 1 ? 'Link deleted' : `${removed.length} links deleted`;
  showToast(label, { undo: true });
  selectedLinkIds.clear();
  if (linkSelectMode) exitSelectionMode('links');
}

async function deleteQuickNotesWithUndo(ids) {
  const idSet = new Set(ids);
  const removed = quickNotes.filter(n => idSet.has(n.id));
  if (!removed.length) return;
  if (editingNoteId && idSet.has(editingNoteId)) resetNoteComposer();
  await send('DELETE_QUICK_NOTES', { ids: [...idSet] });
  scheduleUndo({ type: 'quickNotes', items: removed });
  const label = removed.length === 1 ? 'Note deleted' : `${removed.length} notes deleted`;
  showToast(label, { undo: true });
  selectedNoteIds.clear();
  if (noteSelectMode) exitSelectionMode('notes');
}

function linkHostname(url) {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function linkFaviconUrl(entry) {
  if (entry.faviconUrl) return entry.faviconUrl;
  const host = linkHostname(entry.url);
  return `https://www.google.com/s2/favicons?domain=${host}&sz=32`;
}

function applyLinkPreview(item, entry) {
  const favicon = item.querySelector('.link-favicon');
  const titleEl = item.querySelector('.link-title');
  const urlEl   = item.querySelector('.link-url');
  const hasTitle = Boolean(entry.title && entry.title !== linkHostname(entry.url));
  item.classList.toggle('has-title', hasTitle);
  favicon.src = linkFaviconUrl(entry);
  favicon.alt = hasTitle ? entry.title : linkHostname(entry.url);
  if (hasTitle) {
    titleEl.textContent = entry.title;
    urlEl.textContent = prettyUrl(entry.url);
  } else {
    titleEl.textContent = '';
    urlEl.textContent = prettyUrl(entry.url);
  }
}

async function backfillLinkPreviews() {
  const stale = bookmarks.filter(b => !b.previewFetchedAt);
  for (const b of stale.slice(0, 8)) {
    send('FETCH_LINK_PREVIEW', { id: b.id, url: b.url }).catch(() => {});
  }
}

textSearchInput.addEventListener('input', () => {
  textSearchQuery = textSearchInput.value;
  renderTexts();
});
textSortSelect.addEventListener('change', () => {
  textSortOrder = textSortSelect.value;
  renderTexts();
});
linkSearchInput.addEventListener('input', () => {
  linkSearchQuery = linkSearchInput.value;
  renderLinks();
});
linkSortSelect.addEventListener('change', () => {
  linkSortOrder = linkSortSelect.value;
  renderLinks();
});
textSelectBtn.addEventListener('click', () => toggleSelectionMode('texts'));
linkSelectBtn.addEventListener('click', () => toggleSelectionMode('links'));
snapSelectBtn.addEventListener('click', () => toggleSelectionMode('snaps'));
textBulkDeleteBtn.addEventListener('click', async () => {
  if (!selectedTextIds.size) return;
  if (!confirm(`Delete ${selectedTextIds.size} selected text(s)?`)) return;
  await deleteTextsWithUndo([...selectedTextIds]);
});
linkBulkDeleteBtn.addEventListener('click', async () => {
  if (!selectedLinkIds.size) return;
  if (!confirm(`Delete ${selectedLinkIds.size} selected link(s)?`)) return;
  await deleteBookmarksWithUndo([...selectedLinkIds]);
});
snapBulkDeleteBtn.addEventListener('click', async () => {
  if (!selectedSnapIds.size) return;
  if (!confirm(`Delete ${selectedSnapIds.size} selected screenshot(s)?`)) return;
  await deleteScreenshotsWithUndo([...selectedSnapIds]);
});
noteSearchInput.addEventListener('input', () => {
  noteSearchQuery = noteSearchInput.value;
  renderNotes();
});
noteSortSelect.addEventListener('change', () => {
  noteSortOrder = noteSortSelect.value;
  renderNotes();
});
noteSelectBtn.addEventListener('click', () => toggleSelectionMode('notes'));
noteBulkDeleteBtn.addEventListener('click', async () => {
  if (!selectedNoteIds.size) return;
  if (!confirm(`Delete ${selectedNoteIds.size} selected note(s)?`)) return;
  await deleteQuickNotesWithUndo([...selectedNoteIds]);
});
noteSaveBtn.addEventListener('click', () => saveQuickNoteFromComposer());
noteCancelEditBtn.addEventListener('click', () => resetNoteComposer());
noteBodyInput?.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    saveQuickNoteFromComposer();
  }
});
toastAction.addEventListener('click', e => {
  e.stopPropagation();
  performUndo();
});

// ── Render (Texts) ──────────────────────────────────────────────────────────
function renderTexts() {
  const known = new Set([...textList.children].map(c => c.dataset.id));
  textList.innerHTML = '';

  const visible  = getVisibleTexts();
  const hasAny   = texts.length > 0;
  const q        = textSearchQuery.trim();
  const showNoMatch = q.length > 0 && visible.length === 0;

  emptyStateTexts.style.display = (!hasAny && !q) ? '' : 'none';
  emptyStateTextsFiltered.classList.toggle('show', showNoMatch);
  textList.style.display = visible.length ? '' : 'none';

  visible.forEach((entry) => {
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

  item.querySelector('.text-body').addEventListener('click', () => {
    if (textSelectMode) return;
    copyText(entry);
  });
  pinBtn.addEventListener('click', e => { e.stopPropagation(); toggleTextPin(entry.id); });
  item.querySelector('.text-delete-btn').addEventListener('click', e => {
    e.stopPropagation();
    deleteText(entry.id);
  });

  if (textSelectMode) wireItemSelection(item, entry, 'texts');

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

// ── Render (Quick notes) ──────────────────────────────────────────────────────
function noteCopyText(entry) {
  const title = (entry.title || '').trim();
  const body = (entry.text || '').trim();
  return title ? `${title}\n${body}` : body;
}

function resetNoteComposer() {
  editingNoteId = null;
  noteTitleInput.value = '';
  noteBodyInput.value = '';
  noteSaveBtn.textContent = 'Add note';
  noteComposerLabel.textContent = 'New quick note';
  noteCancelEditBtn.hidden = true;
}

function startEditNote(entry) {
  editingNoteId = entry.id;
  noteTitleInput.value = entry.title || '';
  noteBodyInput.value = entry.text || '';
  noteSaveBtn.textContent = 'Save changes';
  noteComposerLabel.textContent = 'Edit note';
  noteCancelEditBtn.hidden = false;
  noteTitleInput.focus();
  noteComposer?.scrollIntoView({ block: 'nearest' });
}

async function saveQuickNoteFromComposer() {
  const title = noteTitleInput.value;
  const text = noteBodyInput.value;
  if (!text.trim()) {
    showToast('Write something first');
    noteBodyInput.focus();
    return;
  }

  try {
    if (editingNoteId) {
      const res = await send('UPDATE_QUICK_NOTE', {
        id: editingNoteId,
        patch: { title, text }
      });
      if (!res?.success) {
        showToast('Could not save note');
        return;
      }
      showToast('Note updated');
    } else {
      const res = await send('SAVE_QUICK_NOTE', { title, text });
      if (!res?.success) {
        showToast('Could not save note');
        return;
      }
      showToast('Note saved');
    }
    resetNoteComposer();
  } catch {
    showToast('Could not save note');
  }
}

function renderNotes() {
  const known = new Set([...noteList.children].map(c => c.dataset.id));
  noteList.innerHTML = '';

  const visible = getVisibleNotes();
  const hasAny = quickNotes.length > 0;
  const q = noteSearchQuery.trim();
  const showNoMatch = q.length > 0 && visible.length === 0;

  emptyStateNotes.style.display = (!hasAny && !q) ? '' : 'none';
  emptyStateNotesFiltered.classList.toggle('show', showNoMatch);
  noteList.style.display = visible.length ? '' : 'none';

  visible.forEach(entry => {
    noteList.appendChild(buildNoteCard(entry, !known.has(entry.id)));
  });
}

function buildNoteCard(entry, isNew) {
  const template = document.getElementById('noteCardTemplate');
  const node = template.content.cloneNode(true);
  const item = node.querySelector('.note-item');

  item.dataset.id = entry.id;
  if (isNew) item.classList.add('entering');
  item.classList.toggle('pinned', !!entry.pinned);

  const labelEl = item.querySelector('.note-label');
  labelEl.textContent = entry.title || '';
  item.querySelector('.note-content').textContent = entry.text;
  item.querySelector('.text-time').textContent = formatTime(entry.updatedAt || entry.savedAt);

  const pinBtn = item.querySelector('.note-pin-btn');
  pinBtn.title = entry.pinned ? 'Unpin' : 'Pin';
  pinBtn.classList.toggle('active', !!entry.pinned);

  item.querySelector('.note-body').addEventListener('click', () => {
    if (noteSelectMode) return;
    copyQuickNote(entry);
  });
  item.querySelector('.note-edit-btn').addEventListener('click', e => {
    e.stopPropagation();
    if (noteSelectMode) return;
    startEditNote(entry);
  });
  pinBtn.addEventListener('click', e => { e.stopPropagation(); toggleQuickNotePin(entry.id); });
  item.querySelector('.note-delete-btn').addEventListener('click', e => {
    e.stopPropagation();
    deleteQuickNote(entry.id);
  });

  if (noteSelectMode) wireItemSelection(item, entry, 'notes');

  return item;
}

function buildPinnedNoteCard(entry) {
  const template = document.getElementById('pinnedNoteTemplate');
  const node = template.content.cloneNode(true);
  const item = node.querySelector('.pinned-note-item');

  item.dataset.id = entry.id;
  const labelEl = item.querySelector('.pinned-note-label');
  labelEl.textContent = entry.title || '';
  item.querySelector('.pinned-note-content').textContent = entry.text;

  item.querySelector('.pinned-note-copy').addEventListener('click', () => copyQuickNote(entry));
  item.querySelector('.pinned-mini-copy').addEventListener('click', e => {
    e.stopPropagation();
    copyQuickNote(entry);
  });
  item.querySelector('.note-pin-btn').addEventListener('click', e => {
    e.stopPropagation();
    toggleQuickNotePin(entry.id);
  });
  item.querySelector('.note-delete-btn').addEventListener('click', e => {
    e.stopPropagation();
    deleteQuickNote(entry.id);
  });

  return item;
}

async function copyQuickNote(entry) {
  try {
    await navigator.clipboard.writeText(noteCopyText(entry));
    showToast('Note copied');
  } catch {
    showToast('Copy failed — check clipboard permission');
  }
}

async function deleteQuickNote(id) {
  await deleteQuickNotesWithUndo([id]);
}

async function toggleQuickNotePin(id) {
  await send('TOGGLE_QUICK_NOTE_PIN', { id });
}

// ── Render (Links / Bookmarks) ────────────────────────────────────────────────
function renderLinks() {
  const known = new Set([...linkList.children].map(c => c.dataset.id));
  linkList.innerHTML = '';

  const visible  = getVisibleBookmarks();
  const hasAny   = bookmarks.length > 0;
  const q        = linkSearchQuery.trim();
  const showNoMatch = q.length > 0 && visible.length === 0;

  emptyStateLinks.style.display = (!hasAny && !q) ? '' : 'none';
  emptyStateLinksFiltered.classList.toggle('show', showNoMatch);
  linkList.style.display = visible.length ? '' : 'none';

  visible.forEach((entry) => {
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

  applyLinkPreview(item, entry);
  item.querySelector('.text-time').textContent = formatTime(entry.savedAt);

  const pinBtn = item.querySelector('.link-pin-btn');
  pinBtn.title = entry.pinned ? 'Unpin' : 'Pin';
  pinBtn.classList.toggle('active', !!entry.pinned);

  item.querySelector('.link-body').addEventListener('click', () => {
    if (linkSelectMode) return;
    copyBookmark(entry);
  });
  pinBtn.addEventListener('click', e => { e.stopPropagation(); toggleBookmarkPin(entry.id); });
  item.querySelector('.link-open-btn').addEventListener('click', e => {
    e.stopPropagation();
    openBookmark(entry);
  });
  item.querySelector('.link-delete-btn').addEventListener('click', e => {
    e.stopPropagation();
    deleteBookmark(entry.id);
  });

  if (linkSelectMode) wireItemSelection(item, entry, 'links');

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
    const dataUrl = await getShotDataUrl(shot);
    const res  = await fetch(dataUrl);
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
  getShotDataUrl(shot).then(dataUrl => {
    const a    = document.createElement('a');
    a.href     = dataUrl;
    a.download = `screenshot-${shot.savedAt}.png`;
    a.click();
    showToast('Saving image...');
  });
}

async function deleteScreenshot(id) {
  await deleteScreenshotsWithUndo([id]);
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
  await deleteTextsWithUndo([id]);
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
  await deleteBookmarksWithUndo([id]);
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

// ── Lightbox / Preview + Annotations ─────────────────────────────────────────
let currentShot = null;
let annotationTool = 'pen';
let annotationStrokes = [];
let annotationDraft = null;
let annotationDirty = false;
let movingTextIdx = -1;
let selectedTextIdx = -1;
let moveDragOffset = { x: 0, y: 0 };

const TEXT_SIZE_MIN = 10;
const TEXT_SIZE_MAX = 96;
const TEXT_SIZE_STEP = 2;

function parseAnnotations(shot) {
  if (!shot?.annotations) return { strokes: [], displayW: 0, displayH: 0 };
  try {
    const data = typeof shot.annotations === 'string' ? JSON.parse(shot.annotations) : shot.annotations;
    return {
      strokes: Array.isArray(data.strokes) ? data.strokes : [],
      displayW: data.displayW || 0,
      displayH: data.displayH || 0
    };
  } catch {
    return { strokes: [], displayW: 0, displayH: 0 };
  }
}

function resizeAnnotationCanvas() {
  if (!lightboxImg.naturalWidth || !lightboxImgwrap) return;
  const pad = 2;
  const maxW = lightboxImgwrap.clientWidth - pad * 2;
  const maxH = lightboxImgwrap.clientHeight - pad * 2;
  if (maxW <= 0 || maxH <= 0) return;
  const ratio = lightboxImg.naturalWidth / lightboxImg.naturalHeight;
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  w = Math.max(1, Math.floor(w));
  h = Math.max(1, Math.floor(h));
  lightboxImg.style.width = `${w}px`;
  lightboxImg.style.height = `${h}px`;
  lightboxCanvas.width = w;
  lightboxCanvas.height = h;
  lightboxCanvasStack.style.width = `${w}px`;
  lightboxCanvasStack.style.height = `${h}px`;
  redrawAnnotations();
}

if (lightboxImgwrap) {
  new ResizeObserver(() => {
    if (lightbox.classList.contains('open')) resizeAnnotationCanvas();
  }).observe(lightboxImgwrap);
}

function canvasPoint(e) {
  const rect = lightboxCanvas.getBoundingClientRect();
  const scaleX = lightboxCanvas.width / rect.width;
  const scaleY = lightboxCanvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

function redrawAnnotations() {
  const ctx = lightboxCanvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, lightboxCanvas.width, lightboxCanvas.height);
  const color = getComputedStyle(document.documentElement).getPropertyValue('--accent-400').trim() || '#38bdf8';

  for (let i = 0; i < annotationStrokes.length; i++) {
    drawStroke(ctx, annotationStrokes[i], color);
    if (annotationTool === 'move' && i === selectedTextIdx) {
      drawTextSelection(ctx, annotationStrokes[i], color);
    }
  }

  if (annotationDraft?.type === 'pen' && annotationDraft.points?.length > 1) {
    drawStroke(ctx, annotationDraft, color);
  } else if (annotationDraft?.type === 'arrow') {
    drawArrow(ctx, annotationDraft.x1, annotationDraft.y1, annotationDraft.x2, annotationDraft.y2, color, 3);
  }
}

function drawStroke(ctx, stroke, color) {
  if (stroke.type === 'pen' && stroke.points?.length > 1) {
    ctx.strokeStyle = stroke.color || color;
    ctx.lineWidth = stroke.width || 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
  } else if (stroke.type === 'arrow') {
    drawArrow(ctx, stroke.x1, stroke.y1, stroke.x2, stroke.y2, stroke.color || color, stroke.width || 3);
  } else if (stroke.type === 'text' && stroke.text) {
    ctx.font = `600 ${stroke.size || 16}px system-ui, sans-serif`;
    ctx.fillStyle = stroke.color || color;
    ctx.fillText(stroke.text, stroke.x, stroke.y);
  }
}

function drawArrow(ctx, x1, y1, x2, y2, color, width) {
  const head = Math.max(10, width * 4);
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function drawTextSelection(ctx, stroke, color) {
  if (stroke.type !== 'text' || !stroke.text) return;
  const size = stroke.size || 16;
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  const w = ctx.measureText(stroke.text).width;
  const pad = 4;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.65;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(stroke.x - pad, stroke.y - size - pad, w + pad * 2, size + pad * 2);
  ctx.restore();
}

function adjustTextSize(idx, delta) {
  if (idx < 0) return;
  const s = annotationStrokes[idx];
  if (s?.type !== 'text') return;
  const cur = s.size || 16;
  const next = Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, cur + delta));
  if (next === cur) return;
  s.size = next;
  annotationDirty = true;
  redrawAnnotations();
}

function hitTestTextStroke(p) {
  const ctx = lightboxCanvas.getContext('2d');
  if (!ctx) return -1;
  for (let i = annotationStrokes.length - 1; i >= 0; i--) {
    const s = annotationStrokes[i];
    if (s.type !== 'text' || !s.text) continue;
    const size = s.size || 16;
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    const w = ctx.measureText(s.text).width;
    const pad = 6;
    if (p.x >= s.x - pad && p.x <= s.x + w + pad && p.y >= s.y - size - pad && p.y <= s.y + pad) {
      return i;
    }
  }
  return -1;
}

function setAnnotationTool(tool) {
  annotationTool = tool;
  movingTextIdx = -1;
  if (tool !== 'move') selectedTextIdx = -1;
  [annotatePen, annotateArrow, annotateText, annotateMove].forEach(btn => btn.classList.remove('active'));
  if (tool === 'pen') annotatePen.classList.add('active');
  if (tool === 'arrow') annotateArrow.classList.add('active');
  if (tool === 'text') annotateText.classList.add('active');
  if (tool === 'move') annotateMove.classList.add('active');
  lightboxCanvas.classList.toggle('move-mode', tool === 'move');
}

async function openLightbox(shot) {
  try {
    const res = await send('OPEN_VIEWER', {
      id: shot.id,
      width: Math.round(window.screen?.availWidth * 0.98) || 1200,
      height: Math.round(window.screen?.availHeight * 0.98) || 860
    });
    if (res && res.success === false) {
      showToast('Could not open preview');
    }
  } catch {
    showToast('Could not open preview');
  }
}

function closeLightbox() {
  lightbox.classList.remove('open');
  lightbox.setAttribute('aria-hidden', 'true');
  currentShot = null;
  annotationStrokes = [];
  annotationDraft = null;
  annotationDirty = false;
  lightboxImg.onload = null;
  lightboxImg.removeAttribute('src');
  const ctx = lightboxCanvas.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, lightboxCanvas.width, lightboxCanvas.height);
}

async function saveAnnotations() {
  if (!currentShot) return;
  const payload = JSON.stringify({
    version: 1,
    displayW: lightboxCanvas.width,
    displayH: lightboxCanvas.height,
    strokes: annotationStrokes
  });
  await send('UPDATE_SCREENSHOT', { id: currentShot.id, patch: { annotations: payload } });
  currentShot = { ...currentShot, annotations: payload };
  screenshots = screenshots.map(s => s.id === currentShot.id ? currentShot : s);
  annotationDirty = false;
  showToast('Annotations saved');
}

async function getShotDataUrl(shot) {
  // Snaps store the final image in dataUrl; annotation JSON is not kept on source snaps.
  return shot.dataUrl;
}

async function flattenAnnotatedImage(shot, parsed) {
  const strokes = parsed?.strokes || parseAnnotations(shot).strokes;
  const img = new Image();
  img.src = shot.dataUrl;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const refW = parsed?.displayW || lightboxCanvas.width || img.naturalWidth;
  const refH = parsed?.displayH || lightboxCanvas.height || img.naturalHeight;
  const scaleX = img.naturalWidth / refW;
  const scaleY = img.naturalHeight / refH;
  const color = getComputedStyle(document.documentElement).getPropertyValue('--accent-400').trim() || '#38bdf8';

  for (const stroke of strokes) {
    if (stroke.type === 'pen') {
      drawStroke(ctx, {
        ...stroke,
        points: stroke.points.map(p => ({ x: p.x * scaleX, y: p.y * scaleY })),
        width: (stroke.width || 3) * scaleX
      }, color);
    } else if (stroke.type === 'arrow') {
      drawStroke(ctx, {
        ...stroke,
        x1: stroke.x1 * scaleX, y1: stroke.y1 * scaleY,
        x2: stroke.x2 * scaleX, y2: stroke.y2 * scaleY,
        width: (stroke.width || 3) * scaleX
      }, color);
    } else if (stroke.type === 'text') {
      drawStroke(ctx, {
        ...stroke,
        x: stroke.x * scaleX,
        y: stroke.y * scaleY,
        size: (stroke.size || 16) * scaleY
      }, color);
    }
  }
  return canvas.toDataURL('image/png');
}

lightboxClose.addEventListener('click', closeLightbox);
lightboxBackdrop.addEventListener('click', closeLightbox);
lightboxCopy.addEventListener('click', () => { if (currentShot) copyToClipboard(currentShot); });
lightboxSave.addEventListener('click', () => { if (currentShot) downloadImage(currentShot); });
document.addEventListener('keydown', e => {
  if (!lightbox.classList.contains('open')) return;
  if (e.key === 'Escape') {
    closeLightbox();
    return;
  }
  if (annotationTool === 'move' && selectedTextIdx >= 0) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      adjustTextSize(selectedTextIdx, TEXT_SIZE_STEP);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      adjustTextSize(selectedTextIdx, -TEXT_SIZE_STEP);
    }
  }
});

annotatePen.addEventListener('click', () => setAnnotationTool('pen'));
annotateArrow.addEventListener('click', () => setAnnotationTool('arrow'));
annotateText.addEventListener('click', () => setAnnotationTool('text'));
annotateMove.addEventListener('click', () => setAnnotationTool('move'));
annotateUndo.addEventListener('click', () => {
  if (!annotationStrokes.length) return;
  annotationStrokes.pop();
  annotationDirty = true;
  redrawAnnotations();
});
annotateSave.addEventListener('click', () => saveAnnotations());

lightboxCanvas.addEventListener('pointerdown', e => {
  if (!currentShot) return;
  lightboxCanvas.setPointerCapture(e.pointerId);
  const p = canvasPoint(e);
  if (annotationTool === 'move') {
    const idx = hitTestTextStroke(p);
    if (idx >= 0) {
      selectedTextIdx = idx;
      movingTextIdx = idx;
      const s = annotationStrokes[idx];
      moveDragOffset = { x: p.x - s.x, y: p.y - s.y };
      lightboxCanvas.classList.add('dragging');
      redrawAnnotations();
    } else {
      selectedTextIdx = -1;
      redrawAnnotations();
    }
    return;
  }
  if (annotationTool === 'pen') {
    annotationDraft = { type: 'pen', points: [p], color: null, width: 3 };
  } else if (annotationTool === 'arrow') {
    annotationDraft = { type: 'arrow', x1: p.x, y1: p.y, x2: p.x, y2: p.y, color: null, width: 3 };
  } else if (annotationTool === 'text') {
    const label = prompt('Label text');
    if (label?.trim()) {
      annotationStrokes.push({ type: 'text', text: label.trim(), x: p.x, y: p.y, size: 16 });
      annotationDirty = true;
      redrawAnnotations();
    }
  }
});

lightboxCanvas.addEventListener('pointermove', e => {
  const p = canvasPoint(e);
  if (movingTextIdx >= 0) {
    const s = annotationStrokes[movingTextIdx];
    s.x = p.x - moveDragOffset.x;
    s.y = p.y - moveDragOffset.y;
    annotationDirty = true;
    redrawAnnotations();
    return;
  }
  if (!annotationDraft) return;
  if (annotationDraft.type === 'pen') {
    annotationDraft.points.push(p);
    redrawAnnotations();
  } else if (annotationDraft.type === 'arrow') {
    annotationDraft.x2 = p.x;
    annotationDraft.y2 = p.y;
    redrawAnnotations();
  }
});

lightboxCanvas.addEventListener('wheel', e => {
  if (!currentShot || annotationTool !== 'move') return;
  const p = canvasPoint(e);
  const hit = hitTestTextStroke(p);
  const idx = hit >= 0 ? hit : selectedTextIdx;
  if (idx < 0) return;
  e.preventDefault();
  if (hit >= 0) selectedTextIdx = hit;
  const delta = e.deltaY < 0 ? TEXT_SIZE_STEP : -TEXT_SIZE_STEP;
  adjustTextSize(idx, delta);
}, { passive: false });

lightboxCanvas.addEventListener('pointerup', () => {
  if (movingTextIdx >= 0) {
    movingTextIdx = -1;
    lightboxCanvas.classList.remove('dragging');
    return;
  }
  if (!annotationDraft) return;
  if (annotationDraft.type === 'pen' && annotationDraft.points.length > 1) {
    annotationStrokes.push({ ...annotationDraft, points: [...annotationDraft.points] });
  } else if (annotationDraft.type === 'arrow') {
    annotationStrokes.push({ ...annotationDraft });
  }
  annotationDraft = null;
  annotationDirty = true;
  redrawAnnotations();
});

// ── Toast ─────────────────────────────────────────────────────────────────
function showToast(msg, opts = {}) {
  toastMsg.textContent = msg;
  if (opts.undo && undoPending) {
    toastAction.hidden = false;
    toast.classList.add('interactive');
  } else if (!opts.undo) {
    toastAction.hidden = true;
    toast.classList.remove('interactive');
  }
  toast.classList.add('show');
  clearTimeout(toastTimer);
  const duration = opts.undo ? UNDO_MS : (opts.duration || 2000);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
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
