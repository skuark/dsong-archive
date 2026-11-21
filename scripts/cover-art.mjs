// Album covers from the Cover Art Archive: the front image of each post's MusicBrainz release group
// (musicbrainzMetadata.release_group), for the thumbnails on archive tables, posts and radio mode.
// Writes data/covers.json: release group MBID -> { release, image } (the image's thumbnails are
// https://coverartarchive.org/release/<release>/<image>-250.jpg and -500.jpg; hotlinked, not stored).
// No key; 4 requests at a time (each takes ~1.5 s: the Cover Art Archive redirects to archive.org), resumable (answers cached in reports/cover-art.json; --refresh asks again).
// Usage: node scripts/cover-art.mjs [--refresh]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { report } from "../lib/reports.js";

const OUT = "data/covers.json";
const CACHE = report("cover-art.json");
const HEADERS = { "User-Agent": "dsong-archive/1.0 (https://dsong.es)", Accept: "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The release group's front cover, or null when it has none (404). Retries busy answers and network errors.
async function front(id) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(`https://coverartarchive.org/release-group/${id}`, { headers: HEADERS, signal: AbortSignal.timeout(30000) });
      if (res.status === 404) return null;
      if (res.ok) {
        const data = await res.json();
        const image = data.images?.find((i) => i.front) ?? null;
        const release = /\/release\/([0-9a-f-]{36})/.exec(data.release ?? "")?.[1];
        return image && release ? { release, image: String(image.id) } : null;
      }
      if (res.status !== 429 && res.status < 500) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (attempt === 5) throw e;
    }
    await sleep(3000 * (attempt + 1));
  }
}

const posts = JSON.parse(readFileSync("data/posts.json", "utf8")).posts;
const groups = [...new Set(posts.map((p) => p.musicbrainzMetadata?.release_group).filter(Boolean))].sort();
const cache = existsSync(CACHE) && !process.argv.includes("--refresh") ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
const todo = groups.filter((id) => !(id in cache));
console.log(`${groups.length} release groups, ${todo.length} to ask`);

let done = 0, next = 0;
async function worker() {
  while (next < todo.length) {
    const id = todo[next++];
    cache[id] = await front(id);
    if (++done % 50 === 0 || done === todo.length) {
      writeFileSync(CACHE, JSON.stringify(cache, null, 2) + "\n");
      console.log(`${done}/${todo.length}`);
    }
    await sleep(250);
  }
}
await Promise.all(Array.from({ length: 4 }, worker));

const covers = Object.fromEntries(groups.filter((id) => cache[id]).map((id) => [id, cache[id]]));
writeFileSync(OUT, JSON.stringify(covers, null, 2) + "\n");
console.log(`${Object.keys(covers).length} of ${groups.length} release groups with a front cover -> ${OUT}`);
