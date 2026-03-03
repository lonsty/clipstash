/**
 * Generate ClipStash icons (16x16, 48x48, 128x128) as PNG files.
 * Design: Two stacked clipboard cards, pure line-art (stroke only, fully transparent).
 * Back card only draws the exposed edges not hidden behind the front card.
 */

let createCanvas;
try {
  ({ createCanvas } = require('canvas'));
} catch {
  console.log('Installing canvas package...');
  require('child_process').execSync('npm install --save-dev canvas', {
    cwd: require('path').join(__dirname, '..'),
    stdio: 'inherit',
  });
  ({ createCanvas } = require('canvas'));
}

const fs = require('fs');
const path = require('path');

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Draw only the exposed portion of a back card — top edge, left edge,
 * and bottom-left corner that peek out from behind the card in front of it.
 * Back cards are offset to the top-left of the front card.
 */
function drawExposedEdges(ctx, bx, by, bw, bh, br, fx, fy, fw, fh) {
  ctx.beginPath();

  // The back card is offset top-left relative to the front card.
  // Exposed: full top edge, top-right corner, right edge down to fy,
  //          full left edge, bottom-left corner, bottom edge right to fx.

  // Start: right edge, at the level where front card's top starts (fy)
  const rightEdgeStop = Math.min(fy, by + bh);
  ctx.moveTo(bx + bw, rightEdgeStop);
  // Right edge going up
  ctx.lineTo(bx + bw, by + br);
  // Top-right corner
  ctx.quadraticCurveTo(bx + bw, by, bx + bw - br, by);
  // Full top edge
  ctx.lineTo(bx + br, by);
  // Top-left corner
  ctx.quadraticCurveTo(bx, by, bx, by + br);
  // Full left edge going down
  ctx.lineTo(bx, by + bh - br);
  // Bottom-left corner
  ctx.quadraticCurveTo(bx, by + bh, bx + br, by + bh);
  // Bottom edge going right, stop where front card covers
  const bottomVisibleRight = Math.min(fx, bx + bw - br);
  ctx.lineTo(bottomVisibleRight, by + bh);

  ctx.stroke();
}

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const s = size;

  ctx.clearRect(0, 0, s, s);

  const lw = Math.max(s * 0.08, 2);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Card dimensions
  const cardW = s * 0.68;
  const cardH = s * 0.72;
  const cardR = s * 0.07;

  // Front card position
  const frontX = s * 0.22;
  const frontY = s * 0.22;

  // Back card (single layer behind front)
  const backX = frontX - s * 0.12;
  const backY = frontY - s * 0.12;

  // === Back card — only exposed edges ===
  ctx.strokeStyle = '#60a5fa'; // blue-400
  ctx.lineWidth = lw;
  drawExposedEdges(ctx, backX, backY, cardW, cardH, cardR,
    frontX, frontY, cardW, cardH);

  // === Front card — full outline ===
  ctx.strokeStyle = '#2563eb'; // blue-600
  ctx.lineWidth = lw;
  drawRoundedRect(ctx, frontX, frontY, cardW, cardH, cardR);
  ctx.stroke();

  // === Clipboard clip (top center of front card) ===
  const clipW = s * 0.24;
  const clipH = s * 0.11;
  const clipX = frontX + cardW / 2 - clipW / 2;
  const clipY = frontY - clipH * 0.4;
  const clipR = s * 0.04;

  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = lw;
  drawRoundedRect(ctx, clipX, clipY, clipW, clipH, clipR);
  ctx.stroke();

  // Inner hole on clip
  const holeW = s * 0.1;
  const holeH = s * 0.045;
  const holeX = clipX + clipW / 2 - holeW / 2;
  const holeY = clipY + clipH / 2 - holeH / 2;
  const holeR = holeH / 2;
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = Math.max(lw * 0.75, 1.5);
  drawRoundedRect(ctx, holeX, holeY, holeW, holeH, holeR);
  ctx.stroke();

  // === Text lines on front card (3 lines, left-aligned, vertically centered) ===
  const lineX = frontX + s * 0.1;
  const lineMaxW = cardW - s * 0.2;
  const lineGap = s * 0.12;

  const lineLengths = [0.9, 0.6, 0.75];
  const lineCount = lineLengths.length;
  // Vertical center: available area is from clip bottom to card bottom
  const contentTop = clipY + clipH + s * 0.02;
  const contentBottom = frontY + cardH - s * 0.06;
  const totalLinesH = (lineCount - 1) * lineGap;
  const lineStartY = contentTop + (contentBottom - contentTop - totalLinesH) / 2;

  for (let i = 0; i < lineCount; i++) {
    const y = lineStartY + lineGap * i;
    const w = lineMaxW * lineLengths[i];
    ctx.strokeStyle = '#60a5fa'; // blue-400
    ctx.lineWidth = Math.max(lw * 0.8, 1.5);
    ctx.beginPath();
    ctx.moveTo(lineX, y);
    ctx.lineTo(lineX + w, y);
    ctx.stroke();
  }

  return canvas.toBuffer('image/png');
}

/**
 * Generate macOS-style flat icon: rounded-rect background + white line-art foreground.
 * macOS icons use 512x512 or 1024x1024 with ~80% content area inside a rounded square.
 */
function generateMacOSIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const s = size;

  ctx.clearRect(0, 0, s, s);

  // === Background rounded square (macOS style ~80% with ~22.37% corner radius) ===
  const pad = s * 0.1;
  const bgX = pad;
  const bgY = pad;
  const bgW = s - pad * 2;
  const bgH = s - pad * 2;
  const bgR = bgW * 0.2237;

  ctx.fillStyle = '#ffffff';
  drawRoundedRect(ctx, bgX, bgY, bgW, bgH, bgR);
  ctx.fill();

  // Subtle border for white background visibility
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
  ctx.lineWidth = Math.max(s * 0.005, 0.5);
  drawRoundedRect(ctx, bgX, bgY, bgW, bgH, bgR);
  ctx.stroke();

  // === Draw clipboard icon (original blue colors, centered in background) ===
  const lw = Math.max(s * 0.04, 2);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Scale content to fit inside the background with padding
  const contentPad = s * 0.18;
  const contentW = bgW - (contentPad - pad) * 2;
  const contentH = bgH - (contentPad - pad) * 2;

  const cardW = contentW * 0.72;
  const cardH = contentH * 0.74;
  const cardR = s * 0.04;

  // Center the two-card group in the background
  const groupW = cardW + s * 0.08;
  const groupH = cardH + s * 0.08;
  const offsetX = bgX + (bgW - groupW) / 2;
  const offsetY = bgY + (bgH - groupH) / 2 + s * 0.02;

  const frontX = offsetX + s * 0.08;
  const frontY = offsetY + s * 0.08;

  const backX = offsetX;
  const backY = offsetY;

  // Back card — exposed edges
  ctx.strokeStyle = '#60a5fa'; // blue-400 (same as normal icon)
  ctx.lineWidth = lw;
  drawExposedEdges(ctx, backX, backY, cardW, cardH, cardR,
    frontX, frontY, cardW, cardH);

  // Front card — full outline
  ctx.strokeStyle = '#2563eb'; // blue-600
  ctx.lineWidth = lw;
  drawRoundedRect(ctx, frontX, frontY, cardW, cardH, cardR);
  ctx.stroke();

  // Clipboard clip
  const clipW = cardW * 0.36;
  const clipH = s * 0.065;
  const clipX = frontX + cardW / 2 - clipW / 2;
  const clipY = frontY - clipH * 0.4;
  const clipR = s * 0.025;

  ctx.strokeStyle = '#2563eb'; // blue-600
  ctx.lineWidth = lw;
  drawRoundedRect(ctx, clipX, clipY, clipW, clipH, clipR);
  ctx.stroke();

  // Inner hole
  const holeW = clipW * 0.42;
  const holeH = clipH * 0.42;
  const holeX = clipX + clipW / 2 - holeW / 2;
  const holeY = clipY + clipH / 2 - holeH / 2;
  const holeR = holeH / 2;
  ctx.strokeStyle = '#2563eb'; // blue-600
  ctx.lineWidth = Math.max(lw * 0.7, 1);
  drawRoundedRect(ctx, holeX, holeY, holeW, holeH, holeR);
  ctx.stroke();

  // Text lines (left-aligned, vertically centered)
  const macLineX = frontX + s * 0.06;
  const macLineMaxW = cardW - s * 0.12;
  const macLineGap = cardH * 0.17;

  const macLineLengths = [0.9, 0.6, 0.75];
  const macLineCount = macLineLengths.length;
  const macContentTop = clipY + clipH + s * 0.01;
  const macContentBottom = frontY + cardH - s * 0.03;
  const macTotalH = (macLineCount - 1) * macLineGap;
  const macLineStartY = macContentTop + (macContentBottom - macContentTop - macTotalH) / 2;

  for (let i = 0; i < macLineCount; i++) {
    const y = macLineStartY + macLineGap * i;
    const w = macLineMaxW * macLineLengths[i];
    ctx.strokeStyle = '#60a5fa'; // blue-400
    ctx.lineWidth = Math.max(lw * 0.75, 1);
    ctx.beginPath();
    ctx.moveTo(macLineX, y);
    ctx.lineTo(macLineX + w, y);
    ctx.stroke();
  }

  return canvas.toBuffer('image/png');
}

const iconsDir = path.join(__dirname, '..', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

for (const size of [16, 48, 128]) {
  const buf = generateIcon(size);
  const outPath = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(outPath, buf);
  console.log(`Generated ${outPath} (${buf.length} bytes)`);
}

// macOS flat-style icon (used by desktop app for .icns)
for (const size of [128, 256, 512, 1024]) {
  const buf = generateMacOSIcon(size);
  const outPath = path.join(iconsDir, `icon-macos-${size}.png`);
  fs.writeFileSync(outPath, buf);
  console.log(`Generated ${outPath} (${buf.length} bytes)`);
}

console.log('Done!');
