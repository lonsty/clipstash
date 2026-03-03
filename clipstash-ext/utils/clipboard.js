// ClipStash - Clipboard read/write utility (supports text, image, HTML)

/**
 * readClipboardViaScript reads clipboard content by injecting a script into the active tab.
 * Returns { type, content, htmlContent?, imageDataUrl? }
 * @param {number} tabId
 * @returns {Promise<Object|null>}
 */
export async function readClipboardViaScript(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        try {
          const items = await navigator.clipboard.read();
          if (!items || items.length === 0) return null;

          const item = items[0];
          const types = item.types;

          // Check for image
          const imageType = types.find(t => t.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            const arrayBuffer = await blob.arrayBuffer();
            // Compute SHA-256 hash for dedup
            const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const imageHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            // Convert to data URL for display
            const dataUrl = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(blob);
            });
            return {
              type: 'image',
              content: '',
              imageDataUrl: dataUrl,
              imageHash
            };
          }

          // Check for HTML
          if (types.includes('text/html')) {
            const htmlBlob = await item.getType('text/html');
            const htmlContent = await htmlBlob.text();

            let textContent = '';
            if (types.includes('text/plain')) {
              const textBlob = await item.getType('text/plain');
              textContent = await textBlob.text();
            }

            if (htmlContent && htmlContent.trim()) {
              return {
                type: 'html',
                content: textContent || htmlContent.replace(/<[^>]+>/g, ''),
                htmlContent
              };
            }
          }

          // Fallback to plain text
          if (types.includes('text/plain')) {
            const textBlob = await item.getType('text/plain');
            const text = await textBlob.text();
            if (text) {
              return { type: 'text', content: text };
            }
          }

          return null;
        } catch {
          // Fallback to readText
          try {
            const text = await navigator.clipboard.readText();
            return text ? { type: 'text', content: text } : null;
          } catch {
            return null;
          }
        }
      }
    });
    if (results && results[0] && results[0].result) {
      return results[0].result;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * readClipboardViaOffscreen reads clipboard via offscreen document (fallback, text only)
 * @returns {Promise<Object|null>}
 */
export async function readClipboardViaOffscreen() {
  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length === 0) {
      await chrome.offscreen.createDocument({
        url: 'offscreen/offscreen.html',
        reasons: ['CLIPBOARD'],
        justification: 'Read clipboard content'
      });
    }

    const response = await chrome.runtime.sendMessage({ action: 'read-clipboard-offscreen' });
    const text = response?.text || null;
    return text ? { type: 'text', content: text } : null;
  } catch {
    return null;
  }
}
