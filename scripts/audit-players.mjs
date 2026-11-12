// Checks each post's players (YouTube, Spotify, Apple Music) against what the post itself says it
// presents (data/post-context.json): the performer (a cover by X, not the original), the song, and the
// version (live, acoustic, remix…, or the studio original). No API keys: YouTube oEmbed, the Spotify
// embed page and the iTunes lookup API. Player info is cached in players-cache.json (resumable).
// Usage: node scripts/audit-players.mjs [out.md]  (default players-audit.md; read-only for posts.json)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { norm } from "../lib/musicbrainz.js";
import { kindsIn } from "../lib/versions.js";

const out = process.argv[2] ?? "players-audit.md";
const CACHE = "players-cache.json";
const read = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {});
const posts = JSON.parse(readFileSync(new URL("../data/posts.json", import.meta.url), "utf8")).posts;
const context = read(new URL("../data/post-context.json", import.meta.url));
const cache = read(CACHE);
const save = () => writeFileSync(CACHE, JSON.stringify(cache, null, 2) + "\n");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url, headers = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0", ...headers }, signal: AbortSignal.timeout(15000) });
      if (res.ok) return res.text();
      if (res.status === 404 || res.status === 401 || res.status === 400) return null;
    } catch {}
    await sleep(3000 * (attempt + 1));
  }
  return null;
}

// Player -> { title, artist, album } (null = gone).
async function youtube(code) {
  const text = await fetchText(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${code}`)}`);
  if (!text) return null;
  const j = JSON.parse(text);
  return { title: j.title, artist: j.author_name.replace(/ - Topic$/, ""), album: null };
}
async function spotify(url) {
  const html = await fetchText(url);
  if (!html) return null;
  const title = html.match(/"title":"((?:[^"\\]|\\.)*)"/)?.[1];
  const artists = [...(html.match(/"artists":\[(.*?)\]/)?.[1] ?? "").matchAll(/"name":"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`));
  // Albums carry the artist as "subtitle" instead of "artists".
  const subtitle = html.match(/"subtitle":"((?:[^"\\]|\\.)*)"/)?.[1];
  return title ? { title: JSON.parse(`"${title}"`), artist: artists.join(", ") || (subtitle && JSON.parse(`"${subtitle}"`)) || null, album: null } : null;
}
// Apple Music embed URL: /album/<id>?i=<track id> (song) or /album/<id> (album). Looked up in batches.
const appleId = (url) => url.match(/[?&]i=(\d+)/)?.[1] ?? url.match(/\/album\/(?:[^/?]+\/)?(\d+)/)?.[1];
async function apple(ids) {
  const text = await fetchText(`https://itunes.apple.com/lookup?country=ES&id=${ids.join(",")}`);
  const found = {};
  for (const r of text ? JSON.parse(text).results : []) {
    const id = String(r.wrapperType === "track" ? r.trackId : r.collectionId);
    found[id] = { title: r.trackName ?? r.collectionName, artist: r.artistName, album: r.collectionName ?? null };
  }
  return found;
}

const withContext = posts.filter((p) => context[p.id]);
// 1. Fetch player info not cached yet.
const jobs = [];
for (const p of withContext) {
  const m = p.metadata;
  if (m.youtube_code && !(`yt:${m.youtube_code}` in cache)) jobs.push([`yt:${m.youtube_code}`, () => youtube(m.youtube_code), 300]);
  if (m.spotify_url && /\/(track|album)\//.test(m.spotify_url) && !(`sp:${m.spotify_url}` in cache)) jobs.push([`sp:${m.spotify_url}`, () => spotify(m.spotify_url), 400]);
}
console.log(`${jobs.length} YouTube/Spotify players to look up`);
let n = 0;
for (const [key, run, wait] of jobs) {
  cache[key] = await run();
  await sleep(wait);
  if (++n % 50 === 0) { save(); console.log(`${n}/${jobs.length}`); }
}
const appleIds = [...new Set(withContext.map((p) => p.metadata.apple_music_url && appleId(p.metadata.apple_music_url)).filter((id) => id && !(`am:${id}` in cache)))];
console.log(`${appleIds.length} Apple Music players to look up`);
for (let i = 0; i < appleIds.length; i += 150) {
  const batch = appleIds.slice(i, i + 150), found = await apple(batch);
  for (const id of batch) cache[`am:${id}`] = found[id] ?? null;
  save();
  await sleep(3000);
}
save();

// 2. Compare. Names match loosely: "Damien Rice" in "Damien Rice, Lisa Hannigan", or the other way round,
// any one of a duo ("Ara Malikian y Fernando Egozcue"), or a close spelling ("Ce Ce Peniston" = "CeCe Peniston").
const parts = (s) => String(s ?? "").split(/\s+(?:y|and|&|feat\.?|ft\.?|featuring|con|vs\.?|with)\s+|,|\//i).map(norm).filter((p) => p.length > 1);
const squash = (s) => norm(s).replace(/ /g, "");
const has = (a, b) => {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x.includes(y) || y.includes(x) || squash(a).includes(squash(b)) || squash(b).includes(squash(a))) return true;
  return parts(b).some((p) => x.includes(p)) || parts(a).some((p) => y.includes(p));
};
const issues = { gone: [], performer: [], original: [], version: [], studio: [] };
const LABEL = {
  gone: "Player no longer exists",
  performer: "Player artist isn't the performer the post names",
  original: "Post presents a cover, player is the original artist",
  version: "Post presents a specific version, player doesn't look like it",
  studio: "Post presents the original, player looks like another version",
};
for (const p of withContext) {
  const c = context[p.id], m = p.metadata;
  if (["podcast", "other"].includes(c.subject)) continue;
  const performer = c.performer ?? m.artist;
  const players = [
    m.youtube_code && ["YouTube", cache[`yt:${m.youtube_code}`]],
    m.spotify_url && /\/(track|album)\//.test(m.spotify_url) && ["Spotify", cache[`sp:${m.spotify_url}`]],
    m.apple_music_url && ["Apple Music", cache[`am:${appleId(m.apple_music_url)}`]],
  ].filter(Boolean);
  for (const [name, info] of players) {
    const row = (detail) => `| [${p.id}](https://dsong.es/archive/${p.id}.html) | ${name} | ${(info ? `${info.artist ?? ""} — ${info.title}` : "").replace(/\|/g, "/")} | ${detail.replace(/\|/g, "/")} |`;
    if (!info) { issues.gone.push(row("")); continue; }
    // YouTube uploaders aren't always the artist: there the title counts too.
    const credited = has(info.artist, performer) || (name === "YouTube" && has(info.title, performer));
    if (c.is_cover && c.original_artist && !credited && (has(info.artist, c.original_artist) || has(info.title, c.original_artist))) issues.original.push(row(`cover by ${performer} of ${c.original_artist}`));
    else if (performer && info.artist && !credited) issues.performer.push(row(`performer: ${performer}`));
    const kinds = kindsIn(`${info.title} ${info.album ?? ""}`);
    if (c.version && !["original", "cover", "other"].includes(c.version) && !kinds.includes(c.version)) issues.version.push(row(`${c.version}${c.version_detail ? `: ${c.version_detail}` : ""}`));
    if (c.version === "original" && kinds.length && !kindsIn(m.song ?? "").length) issues.studio.push(row(`player looks ${kinds.join(", ")}`));
  }
}

const md = [`# Players vs what each post says`, ``,
  `${withContext.length} posts with context. Lines are hints for a human: check before changing anything.`, ``,
  ...Object.entries(issues).flatMap(([k, rows]) => [`## ${LABEL[k]} (${rows.length})`, ``, `| Post | Player | Player says | Post says |`, `|---|---|---|---|`, ...rows, ``]),
].join("\n");
writeFileSync(out, md);
console.log(Object.entries(issues).map(([k, r]) => `${k}: ${r.length}`).join(", "), `-> ${out}`);
