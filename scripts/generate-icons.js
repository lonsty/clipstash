/**
 * Generate ClipStash icons (16x16, 48x48, 128x128) as PNG files.
 * Design: Three stacked blue clipboard cards filling the full canvas,
 * no background color. Front card has a clipboard clip and text lines.
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

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const s = size;

  // Transparent background — no fill

  // === Card dimensions — full canvas coverage ===
  const cardW = s * 0.78;
  const cardH = s * 0.82;
  const cardR = s * 0.08;

  // Front card positioned so the stack fills the canvas
  const frontX = s * 0.18;
  const frontY = s * 0.16;

  // === Back card (furthest, offset top-left) ===
  const backOffX = -s * 0.14;
  const backOffY = -s * 0.1;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.08)';
  ctx.shadowBlur = s * 0.02;
  ctx.shadowOffsetY = s * 0.01;
  drawRoundedRect(ctx, frontX + backOffX, frontY + backOffY, cardW, cardH, cardR);
  const backGrad = ctx.createLinearGradient(
    frontX + backOffX, frontY + backOffY,
    frontX + backOffX + cardW, frontY + backOffY + cardH
  );
  backGrad.addColorStop(0, '#93c5fd'); // blue-300
  backGrad.addColorStop(1, '#60a5fa'); // blue-400
  ctx.fillStyle = backGrad;
  ctx.fill();
  ctx.restore();

  // === Middle card (slight offset) ===
  const midOffX = -s * 0.07;
  const midOffY = -s * 0.05;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.1)';
  ctx.shadowBlur = s * 0.03;
  ctx.shadowOffsetY = s * 0.015;
  drawRoundedRect(ctx, frontX + midOffX, frontY + midOffY, cardW, cardH, cardR);
  const midGrad = ctx.createLinearGradient(
    frontX + midOffX, frontY + midOffY,
    frontX + midOffX + cardW, frontY + midOffY + cardH
  );
  midGrad.addColorStop(0, '#60a5fa'); // blue-400
  midGrad.addColorStop(1, '#3b82f6'); // blue-500
  ctx.fillStyle = midGrad;
  ctx.fill();
  ctx.restore();

  // === Front card (main clipboard) ===
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = s * 0.05;
  ctx.shadowOffsetX = s * 0.01;
  ctx.shadowOffsetY = s * 0.025;
  drawRoundedRect(ctx, frontX, frontY, cardW, cardH, cardR);
  const frontGrad = ctx.createLinearGradient(frontX, frontY, frontX + cardW, frontY + cardH);
  frontGrad.addColorStop(0, '#3b82f6'); // blue-500
  frontGrad.addColorStop(1, '#2563eb'); // blue-600
  ctx.fillStyle = frontGrad;
  ctx.fill();
  ctx.restore();

  // === Clipboard clip (top center of front card) ===
  const clipW = s * 0.24;
  const clipH = s * 0.11;
  const clipX = frontX + cardW / 2 - clipW / 2;
  const clipY = frontY - clipH * 0.4;
  const clipR = s * 0.04;

  drawRoundedRect(ctx, clipX, clipY, clipW, clipH, clipR);
  ctx.fillStyle = '#1d4ed8'; // blue-700
  ctx.fill();

  // Inner hole on clip
  const holeW = s * 0.1;
  const holeH = s * 0.045;
  const holeX = clipX + clipW / 2 - holeW / 2;
  const holeY = clipY + clipH / 2 - holeH / 2;
  const holeR = holeH / 2;
  drawRoundedRect(ctx, holeX, holeY, holeW, holeH, holeR);
  ctx.fillStyle = '#3b82f6'; // blue-500
  ctx.fill();

  // === Text lines on front card (white, representing cached content) ===
  const lineX = frontX + s * 0.1;
  const lineMaxW = cardW - s * 0.2;
  const lineStartY = frontY + s * 0.18;
  const lineGap = s * 0.1;
  const lineH = Math.max(s * 0.032, 1.5);

  const lineLengths = [0.9, 0.6, 0.75, 0.45];
  for (let i = 0; i < lineLengths.length; i++) {
    const y = lineStartY + lineGap * i;
    if (y + lineH > frontY + cardH - s * 0.08) break;
    const w = lineMaxW * lineLengths[i];
    const lineR = lineH / 2;
    drawRoundedRect(ctx, lineX, y, w, lineH, lineR);
    ctx.fillStyle = i === 0 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.5)';
    ctx.fill();
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

console.log('Done!');
