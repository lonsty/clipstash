use arboard::Clipboard;
use base64::Engine;
use sha2::{Digest, Sha256};

/// ClipboardContent represents data read from the system clipboard.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ClipboardContent {
    #[serde(rename = "type")]
    pub content_type: String,
    pub content: String,
    #[serde(rename = "htmlContent")]
    pub html_content: Option<String>,
    #[serde(rename = "imageDataUrl")]
    pub image_data_url: Option<String>,
    #[serde(rename = "imageHash")]
    pub image_hash: Option<String>,
}

/// read_clipboard reads the current system clipboard content.
pub fn read_clipboard() -> Option<ClipboardContent> {
    let mut clipboard = Clipboard::new().ok()?;

    // Try to read image first
    if let Ok(img_data) = clipboard.get_image() {
        let rgba = img_data.bytes.to_vec();
        let width = img_data.width as u32;
        let height = img_data.height as u32;

        // Convert to PNG
        let mut png_bytes = Vec::new();
        if let Some(img_buf) =
            image::RgbaImage::from_raw(width, height, rgba)
                .map(image::DynamicImage::ImageRgba8)
        {
            let mut cursor = std::io::Cursor::new(&mut png_bytes);
            if img_buf
                .write_to(&mut cursor, image::ImageFormat::Png)
                .is_ok()
                && !png_bytes.is_empty()
            {
                // Compute SHA-256 hash
                let mut hasher = Sha256::new();
                hasher.update(&png_bytes);
                let hash = hex::encode(hasher.finalize());

                // Convert to data URL
                let b64 = base64::engine::general_purpose::STANDARD.encode(&png_bytes);
                let data_url = format!("data:image/png;base64,{}", b64);

                return Some(ClipboardContent {
                    content_type: "image".to_string(),
                    content: String::new(),
                    html_content: None,
                    image_data_url: Some(data_url),
                    image_hash: Some(hash),
                });
            }
        }
    }

    // Try to read HTML (arboard supports get_html on some platforms)
    #[cfg(any(target_os = "windows", target_os = "macos"))]
    {
        // arboard doesn't natively support HTML on all platforms,
        // but we attempt to read text which may contain HTML context
    }

    // Read plain text
    if let Ok(text) = clipboard.get_text() {
        if !text.is_empty() {
            return Some(ClipboardContent {
                content_type: "text".to_string(),
                content: text,
                html_content: None,
                image_data_url: None,
                image_hash: None,
            });
        }
    }

    None
}

/// write_text writes text to the system clipboard.
pub fn write_text(text: &str) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    clipboard.set_text(text).map_err(|e| e.to_string())
}

/// write_image writes a PNG data URL to the system clipboard as an image.
pub fn write_image(data_url: &str) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;

    // Parse data URL
    let b64_start = data_url.find(",").ok_or("invalid data url")?;
    let b64_data = &data_url[b64_start + 1..];
    let png_bytes = base64::engine::general_purpose::STANDARD
        .decode(b64_data)
        .map_err(|e| e.to_string())?;

    // Decode the PNG into raw RGBA
    let img = image::load_from_memory(&png_bytes).map_err(|e| e.to_string())?;
    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();

    let img_data = arboard::ImageData {
        width: width as usize,
        height: height as usize,
        bytes: std::borrow::Cow::Owned(rgba.into_raw()),
    };

    clipboard.set_image(img_data).map_err(|e| e.to_string())
}

/// write_html writes HTML content (with text fallback) to the clipboard.
pub fn write_html(html: &str, alt_text: &str) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    clipboard
        .set_html(html, Some(alt_text))
        .map_err(|e| e.to_string())
}

/// get_text_hash returns SHA-256 hash of text content for dedup checking.
pub fn get_text_hash(text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    hex::encode(hasher.finalize())
}
