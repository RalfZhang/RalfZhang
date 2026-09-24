#!/usr/bin/env node
/**
 * Draws the README banner: the road network around Xi'an's old city walls, in
 * InkCity's ink-on-paper palette — one SVG for each GitHub theme.
 *
 * The roads come from the website's src/data/xian-map.json (built by its
 * scripts/build-map.mjs): polylines in 2 m units, first point absolute and the
 * rest as deltas. Here they are clipped to the banner, merged into one path per
 * road class and written back out as relative path data, which keeps each file
 * small enough for a README.
 *
 *   node scripts/build-banner.mjs [path/to/xian-map.json]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = process.argv[2] ?? "https://raw.githubusercontent.com/RalfZhang/website/main/src/data/xian-map.json";
const OUT = path.resolve(ROOT, "assets");

const W = 1600; // banner size, px — GitHub scales it down to the column
const H = 440;
const SPAN_M = 12000; // ground covered by the banner's width, metres
const RADIUS = 16; // corner radius, px

// The map data is centred on Xi'an's geocoded centre, about a kilometre north of
// the Bell Tower. The banner frames the walled city instead: this is the middle of
// the wall's bounding box in OpenStreetMap, and the whole wall fits the height.
const FOCUS = { lat: 34.26521, lon: 108.94365 };

/** InkCity's wallpaper themes, as on ralfz.com. Water is the ink at 30% over the paper. */
const THEMES = {
  light: { bg: "#eee8d6", ink: "#2d2d2d", water: "#b4b0a3" },
  dark: { bg: "#000000", ink: "#5e5d58", water: "#1c1c1a" },
};

// Stroke weights per class in InkCity's units (one unit = 12 m of ground):
// motorway, trunk, primary, secondary, tertiary, minor streets, rail.
const WEIGHT = [1.8, 1.5, 1.2, 1.0, 1.0, 0.85, 0.6];
const WATER_WEIGHT = [1.6, 1.3, 0.7]; // river, canal, anything else
const METERS_PER_WEIGHT = 12;
const MIN_WIDTH_PX = 0.6;

// ---------------------------------------------------------------- data

const raw = SRC.startsWith("http") ? await download(SRC) : JSON.parse(fs.readFileSync(SRC, "utf8"));

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

const k = (W / SPAN_M) * raw.q; // px per data unit
const widthOf = (weight) => Math.max(MIN_WIDTH_PX / k, (weight * METERS_PER_WEIGHT) / raw.q);

// FOCUS in data units, with the projection build-map.mjs uses.
const R = 6378137;
const { lat: lat0, lon: lon0 } = raw.center;
const focusX = ((FOCUS.lon - lon0) * (Math.PI / 180) * R * Math.cos((lat0 * Math.PI) / 180)) / raw.q;
const focusY = (-(FOCUS.lat - lat0) * (Math.PI / 180) * R) / raw.q;

// The banner in data units, centred on FOCUS, padded by the widest stroke so
// lines just outside the edge still show the part that pokes in.
const PAD = widthOf(Math.max(...WEIGHT, ...WATER_WEIGHT));
const X = W / 2 / k + PAD;
const Y = H / 2 / k + PAD;

/** [x0, y0, dx1, dy1, …] from `offset` on → [[x, y], …], relative to FOCUS */
function decode(a, offset) {
  const pts = [];
  let x = 0;
  let y = 0;
  for (let i = offset; i < a.length; i += 2) {
    x = i === offset ? a[i] : x + a[i];
    y = i === offset ? a[i + 1] : y + a[i + 1];
    pts.push([x - focusX, y - focusY]);
  }
  return pts;
}

// ---------------------------------------------------------------- clipping

/** Liang–Barsky against [-X, X] × [-Y, Y]. */
function clipSegment([x0, y0], [x1, y1]) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [
    [-dx, x0 + X],
    [dx, X - x0],
    [-dy, y0 + Y],
    [dy, Y - y0],
  ]) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t > t1) return null;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return null;
      if (t < t1) t1 = t;
    }
  }
  return [[x0 + t0 * dx, y0 + t0 * dy], [x0 + t1 * dx, y0 + t1 * dy], t0 > 0, t1 < 1];
}

/** The runs of a polyline that stay inside the banner. */
function clipPolyline(pts) {
  const runs = [];
  let run = [];
  for (let i = 1; i < pts.length; i++) {
    const seg = clipSegment(pts[i - 1], pts[i]);
    if (!seg) {
      if (run.length > 1) runs.push(run);
      run = [];
      continue;
    }
    const [a, b, aClipped, bClipped] = seg;
    if (aClipped || run.length === 0) {
      if (run.length > 1) runs.push(run);
      run = [a];
    }
    run.push(b);
    if (bClipped) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

const overlaps = (pts) =>
  pts.some(([x]) => x >= -X) &&
  pts.some(([x]) => x <= X) &&
  pts.some(([, y]) => y >= -Y) &&
  pts.some(([, y]) => y <= Y);

// ---------------------------------------------------------------- path data

/** Numbers joined as tightly as SVG allows: a minus sign is its own separator. */
const join = (ns) => ns.reduce((s, n, i) => s + (i > 0 && n >= 0 ? " " : "") + n, "");

/** One subpath — "M x y l dx dy …" — with points rounded to whole units, or "" if nothing is left. */
function subpath(pts, close = false) {
  const out = [];
  let px = 0;
  let py = 0;
  for (const [rawX, rawY] of pts) {
    const x = Math.round(rawX);
    const y = Math.round(rawY);
    if (out.length && x === px && y === py) continue;
    out.push(out.length ? [x - px, y - py] : [x, y]);
    px = x;
    py = y;
  }
  if (out.length < 2) return "";
  const [first, ...rest] = out;
  return `M${join(first)}l${join(rest.flat())}${close ? "z" : ""}`;
}

const lines = (polylines) => polylines.flatMap(clipPolyline).map((run) => subpath(run)).join("");

// ---------------------------------------------------------------- layers

const roadsByClass = WEIGHT.map(() => []);
for (const r of raw.roads) roadsByClass[r[0]].push(decode(r, 1));

const waterLinesByClass = WATER_WEIGHT.map(() => []);
for (const l of raw.waterLines) waterLinesByClass[Math.min(l[0], WATER_WEIGHT.length - 1)].push(decode(l, 1));

// Water areas are few and simple, so they are kept whole if they reach the
// banner at all and the clip path trims them.
const waterAreas = raw.waterAreas
  .map((rings) => rings.map((ring) => decode(ring, 0)))
  .filter((rings) => overlaps(rings[0]))
  .map((rings) => rings.map((ring) => subpath(ring, true)).join(""))
  .join("");

const fixed = (n) => +n.toFixed(3);

function render({ bg, ink, water }) {
  const stroke = (color, weight, d) =>
    d && `<path stroke="${color}" stroke-width="${fixed(widthOf(weight))}" d="${d}"/>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
    `<title>Xi'an's road network, drawn in ink</title>`,
    `<defs><clipPath id="banner"><rect width="${W}" height="${H}" rx="${RADIUS}"/></clipPath></defs>`,
    `<g clip-path="url(#banner)">`,
    `<rect width="${W}" height="${H}" fill="${bg}"/>`,
    `<g transform="translate(${W / 2} ${H / 2}) scale(${fixed(k)})" fill="none" stroke-linecap="round" stroke-linejoin="round">`,
    // Water under the roads, as in InkCity; then the roads, heaviest class on top.
    waterAreas && `<path fill="${water}" fill-rule="evenodd" d="${waterAreas}"/>`,
    ...waterLinesByClass.map((ls, c) => stroke(water, WATER_WEIGHT[c], lines(ls))),
    ...roadsByClass.map((rs, c) => stroke(ink, WEIGHT[c], lines(rs))).reverse(),
    `</g>`,
    `</g>`,
    `</svg>`,
  ]
    .filter(Boolean)
    .join("\n")
    .concat("\n");
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, theme] of Object.entries(THEMES)) {
  const file = path.join(OUT, `banner-${name}.svg`);
  const svg = render(theme);
  fs.writeFileSync(file, svg);
  console.log(`wrote ${path.relative(ROOT, file)}: ${(svg.length / 1024).toFixed(0)} KB`);
}
