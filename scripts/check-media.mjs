// Checks that YouTube videos and Spotify embeds still exist (via their public oEmbed endpoints).
// Usage: node scripts/check-media.mjs [report.json]
import { writeFileSync } from "node:fs";
import data from "../data/posts.json" with { type: "json" };

const CONCURRENCY = 3;
const checks = [];
for (const post of data.posts) {
  const { youtube_code: youtube, spotify_url: spotify } = post.editorMetadata;
  if (youtube) checks.push({ id: post.id, type: "youtube", value: youtube,
    url: `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${youtube}`)}` });
  if (spotify) checks.push({ id: post.id, type: "spotify", value: spotify,
    url: `https://open.spotify.com/oembed?url=${encodeURIComponent(spotify.replace("/embed/", "/"))}` });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Returns the HTTP status, waiting on rate limits (429 + Retry-After) instead of failing.
async function status(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (res.status === 429) {
        await sleep((Number(res.headers.get("retry-after")) || 30) * 1000 + 1000);
        attempt--;
        continue;
      }
      if (res.status >= 500) throw new Error(String(res.status));
      return res.status;
    } catch {
      await sleep(2000 * (attempt + 1));
    }
  }
  return "error";
}

const broken = [];
let done = 0;
async function worker() {
  while (checks.length) {
    const check = checks.shift();
    const code = await status(check.url);
    await sleep(200);
    if (code !== 200) broken.push({ id: check.id, type: check.type, value: check.value, status: code });
    if (++done % 200 === 0) console.log(`${done} checked`);
  }
}
const total = checks.length;
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`${total} embeds checked, ${broken.length} broken`);
for (const type of ["youtube", "spotify"]) console.log(`  ${type}: ${broken.filter((b) => b.type === type).length}`);
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(broken, null, 2));
process.exit(broken.length ? 1 : 0);
