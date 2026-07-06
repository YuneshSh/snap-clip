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
const clipboardHint  = $('clipboardHint');

let screenshots = [];
let settings    = { maxScreenshots: 10 };
let toastTimer  = null;

// ── Init ──────────────────────────────────────────────────────────────────
(async () => {
  [settings, screenshots] = await Promise.all([
    send('GET_SETTINGS'),
    send('GET_SCREENSHOTS')
  ]);
  maxInput.value = settings.maxScreenshots;
  renderGrid();

  // Check clipboard for a new screenshot when the popup opens
  await checkClipboard();
})();

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

// ── Clipboard check on popup open ─────────────────────────────────────────
async function checkClipboard() {
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find(t => t.startsWith('image/'));
      if (!imageType) continue;

      const blob     = await item.getType(imageType);
      const dataUrl  = await blobToDataUrl(blob);
      const result   = await send('SAVE_SCREENSHOT', { dataUrl });

      if (result.success) {
        screenshots = await send('GET_SCREENSHOTS');
        renderGrid();
        showToast('Screenshot captured from clipboard');
      }
      return;
    }
  } catch {
    // Clipboard access denied or no image — show hint
    clipboardHint.classList.add('visible');
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
  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
