// Related artists inside the archive, from ListenBrainz's similar artists (labs API, no key): artists people
// listen to in the same sessions. For each linked artist (data/musicbrainz.json) it asks for its 100 most
// similar artists and keeps the ones the archive has posts of. Very popular artists show up in almost every
// list (Radiohead in 482, The Beatles in 450): each score is divided by the square root of how many of the
// archive's lists the artist is in, and a link both ways counts 1.5 times, so Jamiroquai gets Fatboy Slim
// and Basement Jaxx before The Beatles.
// Cache: reports/listenbrainz-similar.json (MBID -> [{ mbid, name, score }], resumable; ~25 min, 1 req/s).
// Writes data/related-artists.json: MBID -> [[MBID, adjusted score]…], strongest first, at most 12.
// Usage: node scripts/related-artists.mjs [--refresh]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mbidsOf, readData } from "../lib/musicbrainz.js";
import { report } from "../lib/reports.js";

const CACHE = report("listenbrainz-similar.json");
const OUT = "data/related-artists.json";
const ALGORITHM = "session_based_days_7500_session_300_contribution_5_threshold_10_limit_100_filter_True_skip_30";
const HEADERS = { "User-Agent": "dsong-archive/1.0 (https://dsong.es)", Accept: "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function similar(mbid) {
  const url = `https://labs.api.listenbrainz.org/similar-artists/json?artist_mbids=${mbid}&algorithm=${ALGORITHM}`;
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch(url, { headers: HEADERS }).catch(() => null);
    if (res?.ok) {
      await sleep(1000);
      const list = await res.json().catch(() => []);
      return (Array.isArray(list) ? list : []).map(({ artist_mbid, name, score }) => ({ mbid: artist_mbid, name, score }));
    }
    // An artist ListenBrainz doesn't know: no similar artists
    if (res && res.status !== 429 && res.status < 500) { await sleep(1000); return []; }
    const wait = Number(res?.headers.get("retry-after")) || 15 * (attempt + 1);
    console.log(`${res?.status ?? "network error"}: waiting ${wait} s`);
    await sleep(wait * 1000);
  }
  throw new Error(`Gave up: ${mbid}`);
}

// Artists linked one to one (a collaboration has no page of its own to relate)
const linked = [...new Set(Object.values(readData().artists).filter((v) => typeof v === "string").flatMap(mbidsOf))];
const cache = !process.argv.includes("--refresh") && existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};
const todo = linked.filter((mbid) => !(mbid in cache));
console.log(`${linked.length} artists, ${todo.length} to ask`);
for (const [i, mbid] of todo.entries()) {
  cache[mbid] = await similar(mbid);
  if (i % 25 === 24 || i === todo.length - 1) {
    writeFileSync(CACHE, JSON.stringify(cache) + "\n");
    console.log(`${i + 1}/${todo.length}`);
  }
}

const inArchive = new Set(linked);
const lists = Object.fromEntries(linked.map((mbid) => [mbid, (cache[mbid] ?? []).filter((s) => s.mbid !== mbid && inArchive.has(s.mbid))]));
const listsOf = {};   // MBID -> in how many of the archive's lists it is
for (const list of Object.values(lists)) for (const s of list) listsOf[s.mbid] = (listsOf[s.mbid] ?? 0) + 1;
const both = (a, b) => lists[b]?.some((s) => s.mbid === a);
const related = {};
for (const [mbid, list] of Object.entries(lists)) {
  const ranked = list.map((s) => [s.mbid, Math.round((s.score / Math.sqrt(listsOf[s.mbid])) * (both(mbid, s.mbid) ? 1.5 : 1))])
    .sort((a, b) => b[1] - a[1]).slice(0, 12);
  if (ranked.length) related[mbid] = ranked;
}
// One artist per line: small, and readable in a diff
const lines = Object.entries(related).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`);
writeFileSync(OUT, `{\n${lines.join(",\n")}\n}\n`);
const counts = Object.values(related).map((l) => l.length);
console.log(`${counts.length} of ${linked.length} artists with related ones in the archive (${counts.reduce((a, b) => a + b, 0)} links)`);
