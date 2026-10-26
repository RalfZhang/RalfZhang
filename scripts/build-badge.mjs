#!/usr/bin/env node
/**
 * Draws the "Open to work" badge: a green pill with a softly pulsing status
 * dot, in English and Chinese. One file serves both GitHub themes: white on
 * green reads on either background, and a plain <img> inside the link is the
 * only markup GitHub's README renderer leaves alone (it pulls an <img> out of a
 * <picture> to wrap it in a link of its own).
 *
 * The text is set in the system font, as GitHub's own UI is. Its width varies a
 * little from one platform's font to the next, so it is pinned with textLength
 * (measured in Chromium against SF Pro, Helvetica and Arial, which agree within
 * a pixel): the pill keeps its shape everywhere, and only an unusually wide
 * fallback font gets squeezed.
 *
 *   node scripts/build-badge.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.resolve(ROOT, "assets");

const LATIN = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif";
const CJK = "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif";

const BADGES = [
  { name: "open-to-work", text: "Open to work", width: 96, font: LATIN },
  { name: "open-to-work-zh", text: "正在求职", width: 60, font: CJK },
];

const GREEN = "#1f883d"; // GitHub's green for open things

const H = 36; // pill height, px
const SIZE = 15; // font size, px
const DOT = { cx: 21, r: 4.5 };
const TEXT_X = 34; // where the text starts
const PAD = 17; // after the text, about the space before the dot

function render({ text, width, font }) {
  const w = TEXT_X + width + PAD;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${H}" width="${w}" height="${H}" role="img">
<title>${text}</title>
<style>
.pulse { transform-box: fill-box; transform-origin: center; animation: pulse 2.4s ease-out infinite; }
@keyframes pulse { from { transform: scale(1); opacity: 0.6; } to { transform: scale(2.6); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .pulse { animation: none; opacity: 0; } }
</style>
<rect width="${w}" height="${H}" rx="${H / 2}" fill="${GREEN}"/>
<circle class="pulse" cx="${DOT.cx}" cy="${H / 2}" r="${DOT.r}" fill="#fff"/>
<circle cx="${DOT.cx}" cy="${H / 2}" r="${DOT.r}" fill="#fff"/>
<text x="${TEXT_X}" y="${H / 2 + 5}" textLength="${width}" lengthAdjust="spacingAndGlyphs" fill="#fff" font-family="${font}" font-size="${SIZE}" font-weight="600">${text}</text>
</svg>
`;
}

fs.mkdirSync(OUT, { recursive: true });
for (const badge of BADGES) {
  const file = path.join(OUT, `${badge.name}.svg`);
  fs.writeFileSync(file, render(badge));
  console.log(`wrote ${path.relative(ROOT, file)}`);
}
