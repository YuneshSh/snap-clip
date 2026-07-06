// Intercept copy events to detect when an image is copied
document.addEventListener('copy', () => {
  // Small delay so the clipboard is fully populated before we read it
  setTimeout(readClipboardImage, 50);
});

async function readClipboardImage() {
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find(t => t.startsWith('image/'));
      if (!imageType) continue;

      const blob = await item.getType(imageType);
      const dataUrl = await blobToDataUrl(blob);
      chrome.runtime.sendMessage({ type: 'SAVE_SCREENSHOT', dataUrl });
      return;
    }
  } catch {
    // Permission denied or non-image clipboard content — silently ignore
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
