// ClipStash - Offscreen document for clipboard reading fallback

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'read-clipboard-offscreen') {
    readClipboard().then(text => {
      sendResponse({ text });
    });
    return true;
  }
});

async function readClipboard() {
  try {
    const area = document.getElementById('clipboard-area');
    area.focus();
    document.execCommand('paste');
    const text = area.value;
    area.value = '';
    return text || null;
  } catch {
    return null;
  }
}
