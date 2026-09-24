#!/usr/bin/env node
/**
 * Refreshes the blog post lists in the READMEs from the blog's Atom feeds: the
 * English README lists the English posts, the Chinese one the Chinese posts.
 *
 * Each list sits between <!-- posts:start --> and <!-- posts:end -->. Nothing
 * else in the file is touched, and a file is only written when its list changes.
 * A feed that fails or comes back empty stops the run instead of clearing a list.
 *
 * Runs daily in .github/workflows/update-posts.yml, or by hand:
 *
 *   node scripts/update-posts.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COUNT = 3; // posts per list

const TARGETS = [
  { file: "README.md", feed: "https://blog.ralfz.com/en/atom.xml" },
  { file: "README.zh-CN.md", feed: "https://blog.ralfz.com/atom.xml" },
];

const START = "<!-- posts:start -->";
const END = "<!-- posts:end -->";

/** The newest `n` posts in an Atom feed, as { title, url }. */
async function latest(feed, n) {
  const res = await fetch(feed);
  if (!res.ok) throw new Error(`${feed}: HTTP ${res.status}`);
  const xml = await res.text();
  const posts = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(([, entry]) => ({
    title: decodeXml(entry.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1].trim() ?? ""),
    url: decodeXml(entry.match(/<link[^>]*href="([^"]+)"/)?.[1] ?? ""),
    published: entry.match(/<published>([^<]+)<\/published>/)?.[1] ?? "",
  }));
  if (!posts.length || posts.some((p) => !p.title || !p.url)) throw new Error(`${feed}: no posts, or a post without a title or link`);
  return posts.sort((a, b) => b.published.localeCompare(a.published)).slice(0, n);
}

/** XML character references and the five predefined entities. */
function decodeXml(s) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  return s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, ref) =>
    ref[0] !== "#" ? (named[ref] ?? m) : String.fromCodePoint(ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : +ref.slice(1)),
  );
}

/** Markdown-safe link text. */
const escapeMarkdown = (s) => s.replace(/[\\`*_[\]<>]/g, "\\$&");

for (const { file, feed } of TARGETS) {
  const posts = await latest(feed, COUNT);
  const list = posts.map((p) => `- [${escapeMarkdown(p.title)}](${p.url})`).join("\n");

  const target = path.join(ROOT, file);
  const readme = fs.readFileSync(target, "utf8");
  const start = readme.indexOf(START);
  const end = readme.indexOf(END);
  if (start < 0 || end < start) throw new Error(`${file}: missing ${START} … ${END}`);

  const next = `${readme.slice(0, start + START.length)}\n${list}\n${readme.slice(end)}`;
  if (next === readme) {
    console.log(`${file}: up to date`);
    continue;
  }
  fs.writeFileSync(target, next);
  console.log(`${file}: ${posts.length} posts from ${feed}`);
}
