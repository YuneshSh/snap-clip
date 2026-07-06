// Real-time clipboard monitoring so that every copied screenshot is captured —
// even several taken back-to-back — instead of only the last one left on the
// clipboard when the popup happens to open.
//
// The OS clipboard only ever holds ONE image at a time, so the only way to keep
// every screenshot is to grab each one the instant it is copied. That requires a
// focused document (a browser tab), which is why this lives in a content script.

// Remembers the last image we captured on this page so repeated reads of the
// same clipboard content don't fire duplicate saves.
let lastCapturedKey = null;
let capturing = false;

async function captureClipboardImage() {
  // The Clipboard API only allows reads while the document is focused.
  if (!document.hasFocus() || capturing) return;
  capturing = true;

  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find(t => t.startsWith('image/'));
      if (!imageType) continue;

      const blob    = await item.getType(imageType);
      const dataUrl = await blobToDataUrl(blob);

      // Skip if this exact image was the one we captured last.
      if (dataUrl === lastCapturedKey) return;
      lastCapturedKey = dataUrl;

      chrome.runtime.sendMessage({ type: 'SAVE_SCREENSHOT', dataUrl });
      return;
    }
  } catch {
    // Permission denied, not focused, or no image — ignore silently.
  } finally {
    capturing = false;
  }
}

// 1) In-page copies (e.g. right-click → "Copy image"). The tiny delay lets the
//    clipboard finish populating before we read it.
document.addEventListener('copy', () => setTimeout(captureClipboardImage, 50));

// 2) Real-time OS clipboard monitoring.
if (navigator.clipboard && 'onclipboardchange' in navigator.clipboard) {
  // Preferred: event-driven, no polling. Fires on every clipboard change while
  // the tab is focused (Chrome/Edge 144+).
  navigator.clipboard.addEventListener('clipboardchange', captureClipboardImage);
} else {
  // Fallback for browsers without the clipboardchange event: poll while focused.
  setInterval(() => { if (document.hasFocus()) captureClipboardImage(); }, 1500);
}

// 3) When a tab regains focus, grab whatever image is currently on the clipboard
//    (covers screenshots copied while another app was focused).
window.addEventListener('focus', captureClipboardImage);

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
