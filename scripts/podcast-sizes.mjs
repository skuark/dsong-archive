// Writes data/podcast-sizes.json: byte size of each podcast mp3 (the RSS <enclosure> requires it).
// The archive's mp3s don't change, so this runs by hand only when podcast_file values change.
// Usage: node scripts/podcast-sizes.mjs
import { readFileSync, writeFileSync } from "node:fs";

const BASE = "https://dsongstatic.jesusmagamu.dev/mp3/podcast/";
const { posts } = JSON.parse(readFileSync("data/posts.json", "utf8"));
const files = [...new Set(posts.map((post) => post.metadata.podcast_file).filter(Boolean))].sort();

const sizes = {};
const failed = [];
const queue = [...files];
async function worker() {
  for (let file = queue.shift(); file; file = queue.shift()) {
    const res = await fetch(BASE + file, { method: "HEAD" }).catch(() => null);
    const length = Number(res?.headers.get("content-length"));
    if (res?.ok && length > 0) sizes[file] = length;
    else failed.push(file);
  }
}
await Promise.all(Array.from({ length: 8 }, worker));

const sorted = Object.fromEntries(Object.entries(sizes).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync("data/podcast-sizes.json", JSON.stringify(sorted, null, 2) + "\n");
console.log(`${Object.keys(sorted).length} sizes written${failed.length ? `, ${failed.length} failed: ${failed.join(", ")}` : ""}`);
