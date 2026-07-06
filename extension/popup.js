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

let screenshots   = [];
let settings      = { maxScreenshots: 10 };
let toastTimer    = null;
let capturing     = false;
let autoCaptured  = false;

// ── Init ──────────────────────────────────────────────────────────────────
(async () => {
  [settings, screenshots] = await Promise.all([
    send('GET_SETTINGS'),
    send('GET_SCREENSHOTS')
  ]);
  maxInput.value = settings.maxScreenshots;
  renderGrid();

  // Silently paste the last screenshot from the clipboard on open.
  autoCapture();
})();

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
  screenshots = await send('GET_SCREENSHOTS');
  renderGrid();
  settingsPanel.classList.remove('open');
  settingsBtn.classList.remove('active');
  showToast('Settings saved');
});

clearAllBtn.addEventListener('click', async () => {
  if (!confirm('Delete all saved screenshots?')) return;
  await send('CLEAR_ALL');
  screenshots = [];
  renderGrid();
  showToast('All screenshots cleared');
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
        const entry = result.entry || { id: result.id, dataUrl, savedAt: Date.now() };
        if (!screenshots.some(s => s.id === entry.id)) prependScreenshot(entry);
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

// ── Render ────────────────────────────────────────────────────────────────
function renderGrid() {
  grid.innerHTML = '';

  const hasItems = screenshots.length > 0;
  emptyState.style.display = hasItems ? 'none' : '';
  grid.style.display       = hasItems ? '' : 'none';

  countBadge.textContent = `${screenshots.length} / ${settings.maxScreenshots}`;

  screenshots.forEach((shot, index) => {
    const card = buildCard(shot);
    card.style.animationDelay = `${index * 20}ms`;
    grid.appendChild(card);
  });
}

function prependScreenshot(shot) {
  screenshots.unshift(shot);

  // Respect the configured cap by dropping the oldest rendered card.
  if (screenshots.length > settings.maxScreenshots) {
    screenshots.length = settings.maxScreenshots;
    if (grid.lastElementChild) grid.lastElementChild.remove();
  }

  emptyState.style.display = 'none';
  grid.style.display       = '';

  const card = buildCard(shot);
  grid.prepend(card);

  countBadge.textContent = `${screenshots.length} / ${settings.maxScreenshots}`;
}

function buildCard(shot) {
  const template = document.getElementById('cardTemplate');
  const node     = template.content.cloneNode(true);
  const card     = node.querySelector('.card');

  card.dataset.id = shot.id;
  card.classList.add('entering');

  const img       = card.querySelector('.card-img');
  img.src         = shot.dataUrl;
  img.alt         = 'Screenshot ' + formatTime(shot.savedAt);

  card.querySelector('.card-time').textContent = formatTime(shot.savedAt);

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

// ── Actions ───────────────────────────────────────────────────────────────
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
  await send('DELETE_SCREENSHOT', { id });
  screenshots = screenshots.filter(s => s.id !== id);

  const card = grid.querySelector(`[data-id="${id}"]`);
  if (card) {
    card.style.transition = 'opacity 160ms ease, transform 160ms ease';
    card.style.opacity    = '0';
    card.style.transform  = 'scale(0.9)';
    setTimeout(() => { card.remove(); updateEmpty(); }, 160);
  }

  countBadge.textContent = `${screenshots.length} / ${settings.maxScreenshots}`;
}

function updateEmpty() {
  const hasItems         = grid.children.length > 0;
  emptyState.style.display = hasItems ? 'none' : '';
  grid.style.display       = hasItems ? '' : 'none';
}

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
