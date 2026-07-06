// Real-time clipboard monitoring so that every copied screenshot is captured —
// even several taken back-to-back — instead of only the last one left on the
// clipboard when the popup happens to open.
//
// HARD BROWSER LIMITATION: the Clipboard API can ONLY be read while the document
// has system focus (a security rule), and the OS clipboard holds just ONE image.
// So screenshots taken in an external app (Xnip, Snipping Tool, etc.) while the
// browser is in the background cannot all be recovered — the browser only sees
// the clipboard again once it regains focus, by which point only the last image
// remains. This code captures as aggressively as allowed: every time the tab is
// focused/visible it checks the clipboard, so any image present during a focused
// moment is saved.

const SECURE = window.isSecureContext; // clipboard read only works on https/secure pages

// Cheap signature (type + byte size) of the last image we captured, so repeated
// polls don't re-decode and re-save the same clipboard image.
let lastSignature = null;
let capturing = false;

async function captureClipboardImage() {
  // The Clipboard API rejects reads unless the document currently has focus.
  if (!SECURE || capturing || !document.hasFocus()) return;
  capturing = true;

  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find(t => t.startsWith('image/'));
      if (!imageType) continue;

      const blob = await item.getType(imageType);
      const signature = `${imageType}:${blob.size}`;

      // Same image as last time we looked — nothing new to save.
      if (signature === lastSignature) return;
      lastSignature = signature;

      const dataUrl = await blobToDataUrl(blob);
      chrome.runtime.sendMessage({ type: 'SAVE_SCREENSHOT', dataUrl });
      return;
    }
  } catch {
    // Permission denied, not focused, or no image — ignore silently.
  } finally {
    capturing = false;
  }
}

// 1) In-page copies (e.g. right-click → "Copy image", or Ctrl+C on an image).
document.addEventListener('copy', () => setTimeout(captureClipboardImage, 50));

// 2) Event-driven clipboard monitoring (Chrome/Edge 144+): fires on every
//    clipboard change while the tab is focused — instant, no polling cost.
if (navigator.clipboard && 'onclipboardchange' in navigator.clipboard) {
  navigator.clipboard.addEventListener('clipboardchange', captureClipboardImage);
}

// 3) Polling safety net: while this tab is focused & visible, check the clipboard
//    once a second. This catches images that appeared while the browser was
//    briefly in the background (e.g. between external screenshots) the moment
//    focus returns, and works even without the clipboardchange event.
setInterval(() => {
  if (document.hasFocus() && document.visibilityState === 'visible') {
    captureClipboardImage();
  }
}, 1000);

// 4) Also check immediately whenever the tab regains focus or becomes visible.
window.addEventListener('focus', captureClipboardImage);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') captureClipboardImage();
});

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
