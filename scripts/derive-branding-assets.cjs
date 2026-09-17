/* global __dirname */
// Deterministic extraction from the approved bitmap, not generated/redrawn artwork.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PNG } = require('pngjs');

const directory = path.join(__dirname, '../assets/images');
const sourcePath = path.join(directory, 'lifepilot-icon.png');
const original = fs.readFileSync(sourcePath);
const source = PNG.sync.read(original);
assert.equal(source.width, 1254);
assert.equal(source.height, 1254);

// The inspected logo occupies this interior region, away from the rounded rim.
// Its white/emerald pixels are brighter than the surrounding dark-green backdrop.
// Copy their RGBA values verbatim: no resampling, recoloring, tracing or distortion.
const pixels = [];
let left = source.width, top = source.height, right = 0, bottom = 0;
for (let y = 290; y < 1050; y++) for (let x = 280; x < 1010; x++) {
  const index = (y * source.width + x) * 4;
  if (source.data[index + 1] <= 90) continue;
  pixels.push({ x, y, index });
  left = Math.min(left, x); right = Math.max(right, x);
  top = Math.min(top, y); bottom = Math.max(bottom, y);
}
assert.ok(pixels.length > 200000, 'Expected the full LP and leaf artwork');
// Slight optical offset balances the tall L against the lower-right leaf and
// keeps all artwork inside the safe circle without shrinking the original pixels.
const centerX = Math.floor((left + right) / 2) - 16, centerY = Math.floor((top + bottom) / 2) - 16;

function extract(size, name) {
  const target = new PNG({ width: size, height: size });
  let radius = 0;
  for (const { x, y, index } of pixels) {
    const dx = x - centerX, dy = y - centerY;
    radius = Math.max(radius, Math.hypot(dx, dy));
    const targetIndex = ((dy + size / 2) * size + dx + size / 2) * 4;
    source.data.copy(target.data, targetIndex, index, index + 4);
  }
  fs.writeFileSync(path.join(directory, name), PNG.sync.write(target));
  return { target, radius };
}
const adaptive = extract(1536, 'lifepilot-adaptive-foreground.png');
assert.ok(adaptive.radius < 1536 * 33 / 108, 'Artwork must fit the 66dp safe-zone circle');
const splash = extract(1024, 'lifepilot-splash.png');
assert.ok(splash.radius * 200 / 1024 < 96, 'Splash artwork must fit Android 12 icon mask at imageWidth 200');
assert.deepEqual(fs.readFileSync(sourcePath), original, 'Approved source must remain unchanged');
console.log(JSON.stringify({ sourceSHA256: crypto.createHash('sha256').update(original).digest('hex'),
  artworkBounds: { left, top, right, bottom }, preservedPixels: pixels.length,
  adaptiveLogoDp: { width: (right - left + 1) * 108 / 1536, height: (bottom - top + 1) * 108 / 1536 },
  adaptiveRadiusDp: adaptive.radius * 108 / 1536, safeRadiusDp: 33 }, null, 2));
