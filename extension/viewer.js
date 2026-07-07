const $ = id => document.getElementById(id);

const viewerTime = $('viewerTime');
const viewerImg = $('viewerImg');
const viewerCanvas = $('viewerCanvas');
const viewerCanvasStack = $('viewerCanvasStack');
const viewerWorkspace = $('viewerWorkspace');
const viewerEmpty = $('viewerEmpty');
const viewerToast = $('viewerToast');
const viewerClose = $('viewerClose');
const viewerCopy = $('viewerCopy');
const viewerSave = $('viewerSave');
const annotatePen = $('annotatePen');
const annotateArrow = $('annotateArrow');
const annotateSquare = $('annotateSquare');
const annotateText = $('annotateText');
const annotateSelect = $('annotateSelect');
const annotateMove = $('annotateMove');
const annotateDelete = $('annotateDelete');
const annotateUndo = $('annotateUndo');
const annotateSave = $('annotateSave');
const annotateColors = $('annotateColors');
const annotateColorCustom = $('annotateColorCustom');

const THEMES = ['ocean', 'violet', 'fuchsia', 'mint', 'sunset', 'coral', 'indigo', 'aurora'];
const TEXT_SIZE_MIN = 10;
const TEXT_SIZE_MAX = 96;
const TEXT_SIZE_STEP = 2;
const STROKE_WIDTH_MIN = 1;
const STROKE_WIDTH_MAX = 24;
const STROKE_WIDTH_STEP = 1;
const SQUARE_SIZE_MIN = 8;
const SQUARE_SIZE_STEP = 4;
const HANDLE_DRAW_RADIUS = 5;
const HANDLE_HIT_RADIUS = 10;

const shotId = new URLSearchParams(location.search).get('id');

let currentShot = null;
let annotationTool = 'pen';
let annotationColor = '#38bdf8';
let annotationStrokes = [];
let annotationDraft = null;
let annotationDirty = false;
let movingStrokeIdx = -1;
let selectedStrokeIdx = -1;
let moveStartPoint = null;
let moveSnapshot = null;
let resizingStrokeIdx = -1;
let resizeHandle = null;
let resizeSnapshot = null;
let toastTimer = null;
let imageObjectUrl = null;
let autoSyncTimer = null;
let autoSyncInFlight = false;
let autoSyncQueued = false;

const AUTO_SYNC_MS = 400;

function getDefaultAnnotationColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--accent-400').trim() || '#38bdf8';
}

function normalizeHexColor(color) {
  if (!color) return getDefaultAnnotationColor();
  const hex = color.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/.test(hex)) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return getDefaultAnnotationColor();
}

function colorsMatch(a, b) {
  return normalizeHexColor(a) === normalizeHexColor(b);
}

function updateColorPickerUI() {
  const current = normalizeHexColor(annotationColor);
  let hasPreset = false;
  annotateColors?.querySelectorAll('.annotate-color[data-color]').forEach(btn => {
    const match = colorsMatch(btn.dataset.color, current);
    btn.classList.toggle('active', match);
    if (match) hasPreset = true;
  });
  annotateColors?.querySelector('.annotate-color-custom')?.classList.toggle('active', !hasPreset);
  if (annotateColorCustom) annotateColorCustom.value = current;
}

function setAnnotationColor(color, options = { applyToSelection: true }) {
  annotationColor = normalizeHexColor(color);
  updateColorPickerUI();
  if (options.applyToSelection && isSelectionTool() && selectedStrokeIdx >= 0) {
    annotationStrokes[selectedStrokeIdx].color = annotationColor;
    markAnnotationsChanged();
    redrawAnnotations();
  }
}

function syncColorPickerToSelection() {
  if (selectedStrokeIdx < 0) return;
  const stroke = annotationStrokes[selectedStrokeIdx];
  if (!stroke) return;
  if (stroke.color) {
    annotationColor = normalizeHexColor(stroke.color);
    updateColorPickerUI();
  }
}

function revokeImageUrl() {
  if (imageObjectUrl) {
    URL.revokeObjectURL(imageObjectUrl);
    imageObjectUrl = null;
  }
}

async function readLocal(keys) {
  return chrome.storage.local.get(keys);
}

async function assignImageSrc(dataUrl) {
  revokeImageUrl();
  if (!dataUrl) throw new Error('missing image data');

  // Blob URLs avoid browser limits on very long data: URLs in img src.
  if (dataUrl.startsWith('data:image/')) {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    imageObjectUrl = URL.createObjectURL(blob);
    viewerImg.src = imageObjectUrl;
    return;
  }

  viewerImg.src = dataUrl;
}

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

function applyTheme(theme) {
  const t = THEMES.includes(theme) ? theme : 'ocean';
  document.documentElement.dataset.theme = t;
}

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  if (isToday) return time;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time;
}

function showToast(msg, duration = 2200) {
  viewerToast.textContent = msg;
  viewerToast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => viewerToast.classList.remove('show'), duration);
}

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

function workspaceMaxSize() {
  const pad = 0;
  const bar = document.querySelector('.viewer-bar');
  const tools = document.querySelector('.viewer-tools');
  const chromeH =
    (bar?.getBoundingClientRect().height || 0) +
    (tools?.getBoundingClientRect().height || 0);
  const workspaceRect = viewerWorkspace?.getBoundingClientRect();
  const maxW = Math.floor((workspaceRect?.width || window.innerWidth) - pad * 2);
  const maxH = Math.floor((workspaceRect?.height || window.innerHeight - chromeH) - pad * 2);
  return { maxW: Math.max(maxW, 1), maxH: Math.max(maxH, 1) };
}

function resizeAnnotationCanvas() {
  if (!viewerImg.naturalWidth || !viewerWorkspace) return;
  const { maxW, maxH } = workspaceMaxSize();
  if (maxW <= 0 || maxH <= 0) return;
  const ratio = viewerImg.naturalWidth / viewerImg.naturalHeight;
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  viewerImg.style.width = `${w}px`;
  viewerImg.style.height = `${h}px`;
  viewerCanvas.width = w;
  viewerCanvas.height = h;
  viewerCanvasStack.style.width = `${w}px`;
  viewerCanvasStack.style.height = `${h}px`;
  redrawAnnotations();
}

function scheduleResize() {
  requestAnimationFrame(() => {
    resizeAnnotationCanvas();
    requestAnimationFrame(resizeAnnotationCanvas);
  });
}

if (viewerWorkspace) {
  new ResizeObserver(() => scheduleResize()).observe(viewerWorkspace);
}
window.addEventListener('resize', scheduleResize);

function canvasPoint(e) {
  const rect = viewerCanvas.getBoundingClientRect();
  const scaleX = viewerCanvas.width / rect.width;
  const scaleY = viewerCanvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

function redrawAnnotations() {
  const ctx = viewerCanvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, viewerCanvas.width, viewerCanvas.height);
  const color = getComputedStyle(document.documentElement).getPropertyValue('--accent-400').trim() || '#38bdf8';

  for (let i = 0; i < annotationStrokes.length; i++) {
    drawStroke(ctx, annotationStrokes[i], color);
    if (isSelectionTool() && i === selectedStrokeIdx) {
      drawStrokeSelection(ctx, annotationStrokes[i], color);
      if (annotationStrokes[i].type === 'square') {
        drawSquareHandles(ctx, annotationStrokes[i], color);
      }
    }
  }

  if (annotationDraft?.type === 'pen' && annotationDraft.points?.length > 1) {
    drawStroke(ctx, annotationDraft, color);
  } else if (annotationDraft?.type === 'arrow') {
    drawArrow(ctx, annotationDraft.x1, annotationDraft.y1, annotationDraft.x2, annotationDraft.y2, annotationDraft.color || color, annotationDraft.width || 3);
  } else if (annotationDraft?.type === 'square') {
    drawRect(ctx, annotationDraft.x1, annotationDraft.y1, annotationDraft.x2, annotationDraft.y2, annotationDraft.color || color, annotationDraft.width || 3);
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
  } else if (stroke.type === 'square') {
    drawRect(ctx, stroke.x1, stroke.y1, stroke.x2, stroke.y2, stroke.color || color, stroke.width || 3);
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

function drawRect(ctx, x1, y1, x2, y2, color, width) {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';
  ctx.strokeRect(x, y, Math.max(w, 1), Math.max(h, 1));
}

function getStrokeBounds(stroke) {
  if (stroke.type === 'text' && stroke.text) {
    const ctx = viewerCanvas.getContext('2d');
    const size = stroke.size || 16;
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    const w = ctx.measureText(stroke.text).width;
    return { x: stroke.x, y: stroke.y - size, w, h: size };
  }
  if (stroke.type === 'arrow' || stroke.type === 'square') {
    const minX = Math.min(stroke.x1, stroke.x2);
    const minY = Math.min(stroke.y1, stroke.y2);
    return {
      x: minX,
      y: minY,
      w: Math.abs(stroke.x2 - stroke.x1),
      h: Math.abs(stroke.y2 - stroke.y1)
    };
  }
  if (stroke.type === 'pen' && stroke.points?.length) {
    let minX = stroke.points[0].x;
    let minY = stroke.points[0].y;
    let maxX = minX;
    let maxY = minY;
    for (const pt of stroke.points) {
      minX = Math.min(minX, pt.x);
      minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  return null;
}

function drawStrokeSelection(ctx, stroke, color) {
  const bounds = getStrokeBounds(stroke);
  if (!bounds) return;
  const pad = stroke.type === 'text' ? 4 : 6;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.65;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(
    bounds.x - pad,
    bounds.y - pad,
    Math.max(bounds.w, 1) + pad * 2,
    Math.max(bounds.h, 1) + pad * 2
  );
  ctx.restore();
}

function getSquareNormalized(stroke) {
  return {
    left: Math.min(stroke.x1, stroke.x2),
    top: Math.min(stroke.y1, stroke.y2),
    right: Math.max(stroke.x1, stroke.x2),
    bottom: Math.max(stroke.y1, stroke.y2)
  };
}

function applySquareBounds(stroke, bounds) {
  stroke.x1 = bounds.left;
  stroke.y1 = bounds.top;
  stroke.x2 = bounds.right;
  stroke.y2 = bounds.bottom;
}

function getSquareHandles(stroke) {
  const b = getSquareNormalized(stroke);
  const cx = (b.left + b.right) / 2;
  const cy = (b.top + b.bottom) / 2;
  return {
    nw: { x: b.left, y: b.top },
    n: { x: cx, y: b.top },
    ne: { x: b.right, y: b.top },
    e: { x: b.right, y: cy },
    se: { x: b.right, y: b.bottom },
    s: { x: cx, y: b.bottom },
    sw: { x: b.left, y: b.bottom },
    w: { x: b.left, y: cy }
  };
}

const HANDLE_CURSORS = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize'
};

function hitTestSquareHandle(stroke, p) {
  const handles = getSquareHandles(stroke);
  for (const [id, pt] of Object.entries(handles)) {
    if (Math.hypot(p.x - pt.x, p.y - pt.y) <= HANDLE_HIT_RADIUS) return id;
  }
  return null;
}

function findSquareHandleAtPoint(p) {
  for (let i = annotationStrokes.length - 1; i >= 0; i--) {
    const s = annotationStrokes[i];
    if (s.type !== 'square') continue;
    const handle = hitTestSquareHandle(s, p);
    if (handle) return { idx: i, handle };
  }
  return null;
}

function drawSquareHandles(ctx, stroke, color) {
  const handles = getSquareHandles(stroke);
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  for (const pt of Object.values(handles)) {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, HANDLE_DRAW_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function clampSquareBounds(bounds, handle) {
  const b = { ...bounds };
  if (b.right - b.left < SQUARE_SIZE_MIN) {
    if (handle?.includes('w')) b.left = b.right - SQUARE_SIZE_MIN;
    else b.right = b.left + SQUARE_SIZE_MIN;
  }
  if (b.bottom - b.top < SQUARE_SIZE_MIN) {
    if (handle?.includes('n')) b.top = b.bottom - SQUARE_SIZE_MIN;
    else b.bottom = b.top + SQUARE_SIZE_MIN;
  }
  return b;
}

function applySquareResize(stroke, snap, handle, p) {
  let { left, top, right, bottom } = snap;
  switch (handle) {
    case 'nw': left = p.x; top = p.y; break;
    case 'n': top = p.y; break;
    case 'ne': right = p.x; top = p.y; break;
    case 'e': right = p.x; break;
    case 'se': right = p.x; bottom = p.y; break;
    case 's': bottom = p.y; break;
    case 'sw': left = p.x; bottom = p.y; break;
    case 'w': left = p.x; break;
    default: return;
  }
  applySquareBounds(stroke, clampSquareBounds({ left, top, right, bottom }, handle));
}

function adjustSquareBounds(idx, key) {
  if (idx < 0) return;
  const s = annotationStrokes[idx];
  if (s?.type !== 'square') return;
  const b = getSquareNormalized(s);
  const step = SQUARE_SIZE_STEP;
  switch (key) {
    case 'ArrowRight': b.right += step; break;
    case 'ArrowLeft': b.left -= step; break;
    case 'ArrowDown': b.bottom += step; break;
    case 'ArrowUp': b.top -= step; break;
    default: return;
  }
  if (b.right - b.left < SQUARE_SIZE_MIN || b.bottom - b.top < SQUARE_SIZE_MIN) return;
  applySquareBounds(s, b);
  annotationDirty = true;
  redrawAnnotations();
  scheduleAutoSync();
}

function updateSquareCursor(p) {
  if (!isSelectionTool() || resizingStrokeIdx >= 0) return;
  const hit = findSquareHandleAtPoint(p);
  if (hit) {
    viewerCanvas.style.cursor = HANDLE_CURSORS[hit.handle] || 'pointer';
    return;
  }
  viewerCanvas.style.cursor = '';
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function hitTestPenStroke(stroke, p) {
  if (!stroke.points || stroke.points.length < 2) return false;
  const threshold = (stroke.width || 3) / 2 + 8;
  for (let i = 1; i < stroke.points.length; i++) {
    const a = stroke.points[i - 1];
    const b = stroke.points[i];
    if (distToSegment(p.x, p.y, a.x, a.y, b.x, b.y) <= threshold) return true;
  }
  return false;
}

function hitTestArrowStroke(stroke, p) {
  const threshold = (stroke.width || 3) / 2 + 8;
  return distToSegment(p.x, p.y, stroke.x1, stroke.y1, stroke.x2, stroke.y2) <= threshold;
}

function hitTestTextStroke(stroke, p) {
  if (stroke.type !== 'text' || !stroke.text) return false;
  const size = stroke.size || 16;
  const ctx = viewerCanvas.getContext('2d');
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  const w = ctx.measureText(stroke.text).width;
  const pad = 6;
  return p.x >= stroke.x - pad && p.x <= stroke.x + w + pad &&
    p.y >= stroke.y - size - pad && p.y <= stroke.y + pad;
}

function hitTestSquareStroke(stroke, p) {
  const threshold = (stroke.width || 3) / 2 + 8;
  const left = Math.min(stroke.x1, stroke.x2);
  const right = Math.max(stroke.x1, stroke.x2);
  const top = Math.min(stroke.y1, stroke.y2);
  const bottom = Math.max(stroke.y1, stroke.y2);
  return (
    distToSegment(p.x, p.y, left, top, right, top) <= threshold ||
    distToSegment(p.x, p.y, right, top, right, bottom) <= threshold ||
    distToSegment(p.x, p.y, right, bottom, left, bottom) <= threshold ||
    distToSegment(p.x, p.y, left, bottom, left, top) <= threshold
  );
}

function hitTestStroke(p) {
  for (let i = annotationStrokes.length - 1; i >= 0; i--) {
    const s = annotationStrokes[i];
    if (s.type === 'text' && hitTestTextStroke(s, p)) return i;
    if (s.type === 'pen' && hitTestPenStroke(s, p)) return i;
    if (s.type === 'arrow' && hitTestArrowStroke(s, p)) return i;
    if (s.type === 'square' && hitTestSquareStroke(s, p)) return i;
  }
  return -1;
}

function cloneStroke(stroke) {
  if (stroke.type === 'pen') {
    return { ...stroke, points: stroke.points.map(pt => ({ ...pt })) };
  }
  return { ...stroke };
}

function applyStrokeMove(stroke, snapshot, dx, dy) {
  if (snapshot.type === 'text') {
    stroke.x = snapshot.x + dx;
    stroke.y = snapshot.y + dy;
  } else if (snapshot.type === 'pen') {
    stroke.points = snapshot.points.map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
  } else if (snapshot.type === 'arrow' || snapshot.type === 'square') {
    stroke.x1 = snapshot.x1 + dx;
    stroke.y1 = snapshot.y1 + dy;
    stroke.x2 = snapshot.x2 + dx;
    stroke.y2 = snapshot.y2 + dy;
  }
}

function adjustStrokeSize(idx, delta) {
  if (idx < 0) return;
  const s = annotationStrokes[idx];
  if (!s) return;

  if (s.type === 'text') {
    const cur = s.size || 16;
    const next = Math.min(TEXT_SIZE_MAX, Math.max(TEXT_SIZE_MIN, cur + delta));
    if (next === cur) return;
    s.size = next;
  } else if (s.type === 'pen' || s.type === 'arrow' || s.type === 'square') {
    const cur = s.width || 3;
    const next = Math.min(STROKE_WIDTH_MAX, Math.max(STROKE_WIDTH_MIN, cur + delta));
    if (next === cur) return;
    s.width = next;
  } else {
    return;
  }

  annotationDirty = true;
  redrawAnnotations();
  scheduleAutoSync();
}

function markAnnotationsChanged(options = { sync: true }) {
  annotationDirty = true;
  if (options.sync) scheduleAutoSync();
}

function scheduleAutoSync() {
  clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(() => flushAutoSync(), AUTO_SYNC_MS);
}

async function flushAutoSync(showFeedback = false) {
  if (!currentShot) return;
  if (!annotationDirty && !showFeedback) return;
  if (autoSyncInFlight) {
    autoSyncQueued = true;
    return;
  }
  autoSyncInFlight = true;
  try {
    await autoSaveAndCopy(showFeedback);
  } finally {
    autoSyncInFlight = false;
    if (autoSyncQueued) {
      autoSyncQueued = false;
      if (annotationDirty) scheduleAutoSync();
    }
  }
}

async function autoSaveAndCopy(showFeedback = false) {
  if (!currentShot) return;

  const parsed = getLiveAnnotationPayload();
  const shotForRender = { ...currentShot, annotations: JSON.stringify(parsed) };

  const dataUrl = parsed.strokes.length
    ? await flattenAnnotatedImage(shotForRender, parsed)
    : currentShot.dataUrl;

  try {
    await send('SUPPRESS_CLIPBOARD_CAPTURE', { ms: 2500 });
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    if (showFeedback) showToast('Copied — ready to paste');
  } catch {
    if (showFeedback) showToast('Clipboard copy failed');
  }

  // Keep the source snap clean — the annotated copy is saved separately via clipboard capture.
  if (currentShot.annotations != null) {
    await send('UPDATE_SCREENSHOT', { id: currentShot.id, patch: { annotations: null } });
    currentShot = { ...currentShot, annotations: null };
  }

  annotationDirty = false;
}

function getLiveAnnotationPayload() {
  return {
    version: 1,
    displayW: viewerCanvas.width,
    displayH: viewerCanvas.height,
    strokes: annotationStrokes
  };
}

function isSelectionTool() {
  return annotationTool === 'select' || annotationTool === 'move';
}

function updateDeleteBtn() {
  if (!annotateDelete) return;
  annotateDelete.disabled = !(isSelectionTool() && selectedStrokeIdx >= 0);
}

function deleteSelectedStroke() {
  if (selectedStrokeIdx < 0) {
    showToast('Select an annotation first');
    return;
  }
  annotationStrokes.splice(selectedStrokeIdx, 1);
  selectedStrokeIdx = -1;
  movingStrokeIdx = -1;
  moveStartPoint = null;
  moveSnapshot = null;
  resizingStrokeIdx = -1;
  resizeHandle = null;
  resizeSnapshot = null;
  markAnnotationsChanged();
  redrawAnnotations();
  updateDeleteBtn();
}

function setAnnotationTool(tool) {
  annotationTool = tool;
  movingStrokeIdx = -1;
  moveStartPoint = null;
  moveSnapshot = null;
  resizingStrokeIdx = -1;
  resizeHandle = null;
  resizeSnapshot = null;
  if (tool !== 'select' && tool !== 'move') selectedStrokeIdx = -1;
  [annotatePen, annotateArrow, annotateSquare, annotateText, annotateSelect, annotateMove].forEach(btn => btn.classList.remove('active'));
  if (tool === 'pen') annotatePen.classList.add('active');
  if (tool === 'arrow') annotateArrow.classList.add('active');
  if (tool === 'square') annotateSquare.classList.add('active');
  if (tool === 'text') annotateText.classList.add('active');
  if (tool === 'select') annotateSelect.classList.add('active');
  if (tool === 'move') annotateMove.classList.add('active');
  viewerCanvas.classList.toggle('select-mode', tool === 'select');
  viewerCanvas.classList.toggle('move-mode', tool === 'move');
  updateDeleteBtn();
  redrawAnnotations();
}

async function loadShot(shot) {
  currentShot = shot;
  viewerEmpty.hidden = true;
  viewerWorkspace.hidden = false;
  viewerTime.textContent = formatTime(shot.savedAt);

  annotationStrokes = [];
  annotationDraft = null;
  annotationDirty = false;
  clearTimeout(autoSyncTimer);
  movingStrokeIdx = -1;
  selectedStrokeIdx = -1;
  moveStartPoint = null;
  moveSnapshot = null;
  resizingStrokeIdx = -1;
  resizeHandle = null;
  resizeSnapshot = null;
  setAnnotationTool('pen');
  annotationColor = getDefaultAnnotationColor();
  updateColorPickerUI();

  // One-time cleanup: older builds saved annotation JSON on the source snap.
  if (shot.annotations) {
    send('UPDATE_SCREENSHOT', { id: shot.id, patch: { annotations: null } }).catch(() => {});
    currentShot = { ...shot, annotations: null };
  }

  viewerImg.onerror = () => {
    showToast('Could not load screenshot');
  };
  viewerImg.onload = () => scheduleResize();

  try {
    await assignImageSrc(shot.dataUrl);
    scheduleResize();
  } catch {
    showMissing();
  }
}

function showMissing() {
  currentShot = null;
  revokeImageUrl();
  viewerImg.removeAttribute('src');
  viewerWorkspace.hidden = true;
  viewerEmpty.hidden = false;
}

async function saveAnnotations() {
  await flushAutoSync(true);
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
  const refW = parsed?.displayW || viewerCanvas.width || img.naturalWidth;
  const refH = parsed?.displayH || viewerCanvas.height || img.naturalHeight;
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
    } else if (stroke.type === 'arrow' || stroke.type === 'square') {
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

async function getShotDataUrl(shot) {
  if (shot?.id === currentShot?.id && annotationStrokes.length) {
    return flattenAnnotatedImage(shot, getLiveAnnotationPayload());
  }
  const parsed = parseAnnotations(shot);
  if (!parsed.strokes.length) return shot.dataUrl;
  return flattenAnnotatedImage(shot, parsed);
}

async function copyToClipboard() {
  if (!currentShot) return;
  if (annotationDirty) {
    await flushAutoSync(true);
    return;
  }
  try {
    const dataUrl = await getShotDataUrl(currentShot);
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    showToast('Copied to clipboard');
  } catch {
    showToast('Copy failed — check clipboard permission');
  }
}

function downloadImage() {
  if (!currentShot) return;
  getShotDataUrl(currentShot).then(dataUrl => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `screenshot-${currentShot.savedAt}.png`;
    a.click();
    showToast('Saving image…');
  });
}

function closeViewer() {
  clearTimeout(autoSyncTimer);
  const done = () => {
    revokeImageUrl();
    if (chrome.runtime?.id && chrome.windows?.getCurrent) {
      chrome.windows.getCurrent((win) => {
        if (win?.id != null) {
          chrome.windows.remove(win.id);
        } else {
          send('CLOSE_VIEWER').catch(() => window.close());
        }
      });
      return;
    }
    window.close();
  };
  if (annotationDirty) {
    flushAutoSync().finally(done);
    return;
  }
  done();
}

viewerClose.addEventListener('click', closeViewer);
viewerCopy.addEventListener('click', copyToClipboard);
viewerSave.addEventListener('click', downloadImage);

annotatePen.addEventListener('click', () => setAnnotationTool('pen'));
annotateArrow.addEventListener('click', () => setAnnotationTool('arrow'));
annotateSquare.addEventListener('click', () => setAnnotationTool('square'));
annotateText.addEventListener('click', () => setAnnotationTool('text'));
annotateSelect.addEventListener('click', () => setAnnotationTool('select'));
annotateMove.addEventListener('click', () => setAnnotationTool('move'));
annotateDelete.addEventListener('click', () => deleteSelectedStroke());
annotateUndo.addEventListener('click', () => {
  if (!annotationStrokes.length) return;
  annotationStrokes.pop();
  markAnnotationsChanged();
  redrawAnnotations();
});
annotateSave.addEventListener('click', () => saveAnnotations());

annotateColors?.querySelectorAll('.annotate-color[data-color]').forEach(btn => {
  btn.addEventListener('click', () => setAnnotationColor(btn.dataset.color));
});
annotateColorCustom?.addEventListener('input', e => setAnnotationColor(e.target.value));

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeViewer();
    return;
  }
  if (isSelectionTool() && selectedStrokeIdx >= 0) {
    const s = annotationStrokes[selectedStrokeIdx];
    if (s?.type === 'square' && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      adjustSquareBounds(selectedStrokeIdx, e.key);
      return;
    }
    const step = s?.type === 'text' ? TEXT_SIZE_STEP : STROKE_WIDTH_STEP;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      adjustStrokeSize(selectedStrokeIdx, step);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      adjustStrokeSize(selectedStrokeIdx, -step);
    }
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && isSelectionTool() && selectedStrokeIdx >= 0) {
    e.preventDefault();
    deleteSelectedStroke();
  }
});

viewerCanvas.addEventListener('pointerdown', e => {
  if (!currentShot) return;
  viewerCanvas.setPointerCapture(e.pointerId);
  const p = canvasPoint(e);
  if (annotationTool === 'select') {
    const handleHit = findSquareHandleAtPoint(p);
    if (handleHit) {
      selectedStrokeIdx = handleHit.idx;
      syncColorPickerToSelection();
      resizingStrokeIdx = handleHit.idx;
      resizeHandle = handleHit.handle;
      resizeSnapshot = getSquareNormalized(annotationStrokes[handleHit.idx]);
      viewerCanvas.classList.add('dragging');
      viewerCanvas.style.cursor = HANDLE_CURSORS[handleHit.handle] || 'pointer';
      updateDeleteBtn();
      redrawAnnotations();
      return;
    }
    const idx = hitTestStroke(p);
    selectedStrokeIdx = idx;
    syncColorPickerToSelection();
    updateDeleteBtn();
    redrawAnnotations();
    return;
  }
  if (annotationTool === 'move') {
    const idx = hitTestStroke(p);
    if (idx >= 0) {
      selectedStrokeIdx = idx;
      syncColorPickerToSelection();
      movingStrokeIdx = idx;
      moveStartPoint = p;
      moveSnapshot = cloneStroke(annotationStrokes[idx]);
      viewerCanvas.classList.add('dragging');
      updateDeleteBtn();
      redrawAnnotations();
    } else {
      selectedStrokeIdx = -1;
      updateDeleteBtn();
      redrawAnnotations();
    }
    return;
  }
  if (annotationTool === 'pen') {
    annotationDraft = { type: 'pen', points: [p], color: annotationColor, width: 3 };
  } else if (annotationTool === 'arrow') {
    annotationDraft = { type: 'arrow', x1: p.x, y1: p.y, x2: p.x, y2: p.y, color: annotationColor, width: 3 };
  } else if (annotationTool === 'square') {
    annotationDraft = { type: 'square', x1: p.x, y1: p.y, x2: p.x, y2: p.y, color: annotationColor, width: 3 };
  } else if (annotationTool === 'text') {
    const label = prompt('Label text');
    if (label?.trim()) {
      annotationStrokes.push({ type: 'text', text: label.trim(), x: p.x, y: p.y, size: 16, color: annotationColor });
      markAnnotationsChanged();
      redrawAnnotations();
    }
  }
});

viewerCanvas.addEventListener('pointermove', e => {
  const p = canvasPoint(e);
  if (resizingStrokeIdx >= 0 && resizeHandle && resizeSnapshot) {
    applySquareResize(annotationStrokes[resizingStrokeIdx], resizeSnapshot, resizeHandle, p);
    annotationDirty = true;
    redrawAnnotations();
    return;
  }
  if (movingStrokeIdx >= 0 && moveStartPoint && moveSnapshot) {
    const dx = p.x - moveStartPoint.x;
    const dy = p.y - moveStartPoint.y;
    applyStrokeMove(annotationStrokes[movingStrokeIdx], moveSnapshot, dx, dy);
    annotationDirty = true;
    redrawAnnotations();
    return;
  }
  if (annotationDraft) {
    if (annotationDraft.type === 'pen') {
      annotationDraft.points.push(p);
      redrawAnnotations();
    } else if (annotationDraft.type === 'arrow' || annotationDraft.type === 'square') {
      annotationDraft.x2 = p.x;
      annotationDraft.y2 = p.y;
      redrawAnnotations();
    }
    return;
  }
  if (isSelectionTool()) updateSquareCursor(p);
});

viewerCanvas.addEventListener('wheel', e => {
  if (!currentShot || !isSelectionTool()) return;
  const p = canvasPoint(e);
  const hit = hitTestStroke(p);
  const idx = hit >= 0 ? hit : selectedStrokeIdx;
  if (idx < 0) return;
  e.preventDefault();
  if (hit >= 0) {
    selectedStrokeIdx = hit;
    syncColorPickerToSelection();
    updateDeleteBtn();
  }
  const s = annotationStrokes[idx];
  const step = s?.type === 'text' ? TEXT_SIZE_STEP : STROKE_WIDTH_STEP;
  const delta = e.deltaY < 0 ? step : -step;
  adjustStrokeSize(idx, delta);
}, { passive: false });

viewerCanvas.addEventListener('pointerup', () => {
  if (resizingStrokeIdx >= 0) {
    resizingStrokeIdx = -1;
    resizeHandle = null;
    resizeSnapshot = null;
    viewerCanvas.classList.remove('dragging');
    if (annotationDirty) scheduleAutoSync();
    return;
  }
  if (movingStrokeIdx >= 0) {
    movingStrokeIdx = -1;
    moveStartPoint = null;
    moveSnapshot = null;
    viewerCanvas.classList.remove('dragging');
    if (annotationDirty) scheduleAutoSync();
    return;
  }
  if (!annotationDraft) return;
  if (annotationDraft.type === 'pen' && annotationDraft.points.length > 1) {
    annotationStrokes.push({ ...annotationDraft, points: [...annotationDraft.points] });
  } else if (annotationDraft.type === 'arrow') {
    annotationStrokes.push({ ...annotationDraft });
  } else if (annotationDraft.type === 'square') {
    const w = Math.abs(annotationDraft.x2 - annotationDraft.x1);
    const h = Math.abs(annotationDraft.y2 - annotationDraft.y1);
    if (w > 3 || h > 3) annotationStrokes.push({ ...annotationDraft });
  }
  annotationDraft = null;
  markAnnotationsChanged();
  redrawAnnotations();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.screenshots || !shotId) return;
  const shots = changes.screenshots.newValue || [];
  const shot = shots.find(s => s.id === shotId);
  if (!shot) {
    showMissing();
    return;
  }
  if (currentShot && shot.annotations !== currentShot.annotations && !annotationDirty) {
    currentShot = shot;
  }
});

(async () => {
  if (!shotId) {
    showMissing();
    return;
  }
  try {
    const data = await readLocal(['settings', 'screenshots']);
    applyTheme(data.settings?.theme);
    annotationColor = getDefaultAnnotationColor();
    updateColorPickerUI();
    const shot = (data.screenshots || []).find(s => s.id === shotId);
    if (!shot?.dataUrl) {
      showMissing();
      return;
    }
    await loadShot(shot);
  } catch {
    showMissing();
  }
})();
