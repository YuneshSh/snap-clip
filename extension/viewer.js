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
const annotateText = $('annotateText');
const annotateSelect = $('annotateSelect');
const annotateMove = $('annotateMove');
const annotateDelete = $('annotateDelete');
const annotateUndo = $('annotateUndo');
const annotateSave = $('annotateSave');

const THEMES = ['ocean', 'violet', 'fuchsia', 'mint', 'sunset', 'coral', 'indigo', 'aurora'];
const TEXT_SIZE_MIN = 10;
const TEXT_SIZE_MAX = 96;
const TEXT_SIZE_STEP = 2;
const STROKE_WIDTH_MIN = 1;
const STROKE_WIDTH_MAX = 24;
const STROKE_WIDTH_STEP = 1;

const shotId = new URLSearchParams(location.search).get('id');

let currentShot = null;
let annotationTool = 'pen';
let annotationStrokes = [];
let annotationDraft = null;
let annotationDirty = false;
let movingStrokeIdx = -1;
let selectedStrokeIdx = -1;
let moveStartPoint = null;
let moveSnapshot = null;
let toastTimer = null;
let imageObjectUrl = null;
let autoSyncTimer = null;
let autoSyncInFlight = false;
let autoSyncQueued = false;

const AUTO_SYNC_MS = 400;

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

function getStrokeBounds(stroke) {
  if (stroke.type === 'text' && stroke.text) {
    const ctx = viewerCanvas.getContext('2d');
    const size = stroke.size || 16;
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    const w = ctx.measureText(stroke.text).width;
    return { x: stroke.x, y: stroke.y - size, w, h: size };
  }
  if (stroke.type === 'arrow') {
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

function hitTestStroke(p) {
  for (let i = annotationStrokes.length - 1; i >= 0; i--) {
    const s = annotationStrokes[i];
    if (s.type === 'text' && hitTestTextStroke(s, p)) return i;
    if (s.type === 'pen' && hitTestPenStroke(s, p)) return i;
    if (s.type === 'arrow' && hitTestArrowStroke(s, p)) return i;
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
  } else if (snapshot.type === 'arrow') {
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
  } else if (s.type === 'pen' || s.type === 'arrow') {
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

  const payload = JSON.stringify({
    version: 1,
    displayW: viewerCanvas.width,
    displayH: viewerCanvas.height,
    strokes: annotationStrokes
  });
  const shotForRender = { ...currentShot, annotations: payload };

  await send('UPDATE_SCREENSHOT', { id: currentShot.id, patch: { annotations: payload } });
  currentShot = { ...currentShot, annotations: payload };
  annotationDirty = false;

  const dataUrl = annotationStrokes.length
    ? await flattenAnnotatedImage(shotForRender, parseAnnotations(shotForRender))
    : currentShot.dataUrl;

  try {
    await send('SUPPRESS_CLIPBOARD_CAPTURE', { ms: 2500 });
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    if (showFeedback) showToast('Saved & copied — ready to paste');
  } catch {
    if (showFeedback) showToast('Saved — clipboard copy failed');
  }
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
  markAnnotationsChanged();
  redrawAnnotations();
  updateDeleteBtn();
}

function setAnnotationTool(tool) {
  annotationTool = tool;
  movingStrokeIdx = -1;
  moveStartPoint = null;
  moveSnapshot = null;
  if (tool !== 'select' && tool !== 'move') selectedStrokeIdx = -1;
  [annotatePen, annotateArrow, annotateText, annotateSelect, annotateMove].forEach(btn => btn.classList.remove('active'));
  if (tool === 'pen') annotatePen.classList.add('active');
  if (tool === 'arrow') annotateArrow.classList.add('active');
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

  const parsed = parseAnnotations(shot);
  annotationStrokes = parsed.strokes;
  annotationDraft = null;
  annotationDirty = false;
  clearTimeout(autoSyncTimer);
  movingStrokeIdx = -1;
  selectedStrokeIdx = -1;
  moveStartPoint = null;
  moveSnapshot = null;
  setAnnotationTool('pen');

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

async function getShotDataUrl(shot) {
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

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeViewer();
    return;
  }
  if (isSelectionTool() && selectedStrokeIdx >= 0) {
    const s = annotationStrokes[selectedStrokeIdx];
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
    const idx = hitTestStroke(p);
    selectedStrokeIdx = idx;
    updateDeleteBtn();
    redrawAnnotations();
    return;
  }
  if (annotationTool === 'move') {
    const idx = hitTestStroke(p);
    if (idx >= 0) {
      selectedStrokeIdx = idx;
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
    annotationDraft = { type: 'pen', points: [p], color: null, width: 3 };
  } else if (annotationTool === 'arrow') {
    annotationDraft = { type: 'arrow', x1: p.x, y1: p.y, x2: p.x, y2: p.y, color: null, width: 3 };
  } else if (annotationTool === 'text') {
    const label = prompt('Label text');
    if (label?.trim()) {
      annotationStrokes.push({ type: 'text', text: label.trim(), x: p.x, y: p.y, size: 16 });
      markAnnotationsChanged();
      redrawAnnotations();
    }
  }
});

viewerCanvas.addEventListener('pointermove', e => {
  const p = canvasPoint(e);
  if (movingStrokeIdx >= 0 && moveStartPoint && moveSnapshot) {
    const dx = p.x - moveStartPoint.x;
    const dy = p.y - moveStartPoint.y;
    applyStrokeMove(annotationStrokes[movingStrokeIdx], moveSnapshot, dx, dy);
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

viewerCanvas.addEventListener('wheel', e => {
  if (!currentShot || !isSelectionTool()) return;
  const p = canvasPoint(e);
  const hit = hitTestStroke(p);
  const idx = hit >= 0 ? hit : selectedStrokeIdx;
  if (idx < 0) return;
  e.preventDefault();
  if (hit >= 0) {
    selectedStrokeIdx = hit;
    updateDeleteBtn();
  }
  const s = annotationStrokes[idx];
  const step = s?.type === 'text' ? TEXT_SIZE_STEP : STROKE_WIDTH_STEP;
  const delta = e.deltaY < 0 ? step : -step;
  adjustStrokeSize(idx, delta);
}, { passive: false });

viewerCanvas.addEventListener('pointerup', () => {
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
    const parsed = parseAnnotations(shot);
    annotationStrokes = parsed.strokes;
    currentShot = shot;
    redrawAnnotations();
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
