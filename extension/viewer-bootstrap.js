(function () {
  const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;

  function loadViewer() {
    const s = document.createElement('script');
    s.src = 'viewer.js';
    document.body.appendChild(s);
  }

  if (isExtension) {
    loadViewer();
  } else {
    const mock = document.createElement('script');
    mock.src = '../chrome-mock.js';
    mock.onload = loadViewer;
    document.head.appendChild(mock);
  }
})();
