// Finds Spotify candidates for posts without `spotify_url`, via the Spotify Web API (client credentials
// from .env: SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET; the app owner needs Spotify Premium).
// Songs are searched first by the ISRCs MusicBrainz gives (data/musicbrainz.json: the exact recording),
// then by performer + title; the version the post presents (data/post-context.json) must match.
// Existing players are never touched (see AGENTS.md).
// Usage:
//   node scripts/find-spotify.mjs [--limit=N]   search (resumable) -> spotify-candidates.json
//   node scripts/find-spotify.mjs --apply       write picks with status "auto" or "ok" to posts.json
// Review by hand: set "status" to "ok"/"no" or change "pick"; spotify-review.json ({ id: url|null }) wins.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { norm, readData, readJson, similar } from "../lib/musicbrainz.js";
import { isVersion, kindsIn } from "../lib/versions.js";
import { serializePosts } from "../lib/validate-post.js";
import { report as reportFile } from "../lib/reports.js";

const POSTS = new URL("../data/posts.json", import.meta.url);
const REPORT = reportFile("spotify-candidates.json");
const data = JSON.parse(readFileSync(POSTS, "utf8"));
const results = readJson(REPORT);
const save = () => writeFileSync(REPORT, JSON.stringify(results, null, 2) + "\n");

if (process.argv.includes("--apply")) {
  const decisions = readJson(reportFile("spotify-review.json"));
  let applied = 0;
  for (const post of data.posts) {
    const r = results[post.id];
    const pick = post.id in decisions ? decisions[post.id] : r?.pick && ["auto", "ok"].includes(r.status) ? r.pick : null;
    if (!pick || post.editorMetadata.spotify_url) continue;
    if (!/^https:\/\/open\.spotify\.com\/embed\/(track|album)\/\w{22}$/.test(pick)) throw new Error(`Bad Spotify URL ${pick}`);
    post.editorMetadata.spotify_url = pick;
    applied++;
  }
  writeFileSync(POSTS, serializePosts(data));
  console.log(`${applied} spotify_url added`);
  process.exit(0);
}

if (existsSync(".env")) process.loadEnvFile(".env");
const { SPOTIFY_CLIENT_ID: ID, SPOTIFY_CLIENT_SECRET: SECRET } = process.env;
if (!ID || !SECRET) throw new Error("Missing SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET in .env");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let token = null;
async function auth() {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST", body: "grant_type=client_credentials",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${ID}:${SECRET}`).toString("base64")}` },
  });
  if (!res.ok) throw new Error(`Spotify auth ${res.status}: ${await res.text()}`);
  token = (await res.json()).access_token;
}
async function api(path) {
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!token) await auth();
    const res = await fetch(`https://api.spotify.com/v1/${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    if (res.status === 401) { token = null; continue; }
    if (res.status === 429) { await sleep((Number(res.headers.get("retry-after")) || 5) * 1000); continue; }
    if (res.status === 403) { console.error(`Spotify 403: ${(await res.text()).slice(0, 200)}`); save(); process.exit(1); }
    if (!res.ok) throw new Error(`Spotify ${res.status}: ${(await res.text()).slice(0, 200)}`);
    await sleep(150);
    return res.json();
  }
  throw new Error(`Spotify: gave up on ${path}`);
}
const searchApi = async (type, q) => (await api(`search?type=${type}&limit=10&market=ES&q=${encodeURIComponent(q)}`))[`${type}s`].items.filter(Boolean);

const mb = readData().posts;
const context = readJson(new URL("../data/post-context.json", import.meta.url));
// Title without version/remaster/featuring tails, to compare with the post's song or album.
const base = (s = "") => s.replace(/\s*[([].*?[)\]]/g, "").replace(/\s+-\s+.*$/, "").trim();
const names = (s = "") => norm(s).split(/\s*(?:,|&|\band\b|\by\b|feat\.?|ft\.?|with|con|vs\.?)\s*/).filter(Boolean);
const sameArtist = (performer, artists) => {
  const want = names(performer), have = artists.flatMap((a) => names(a.name));
  return want.some((w) => have.some((h) => h === w || similar(h, w) >= 0.85)) || similar(norm(performer), norm(artists.map((a) => a.name).join(" "))) >= 0.85;
};

function rank(item, { performer, title, kind, albumPost }, via) {
  const name = item.name, album = albumPost ? item.name : item.album?.name ?? "";
  const titleSim = similar(base(name), title);
  const artistOk = sameArtist(performer, item.artists);
  const kinds = kindsIn(`${name} ${album}`);
  // The post presents a version (live…): the candidate must be that version. The original: no version marker.
  const versionOk = kind ? kinds.includes(kind) : !isVersion(name);
  const score = titleSim + (artistOk ? 1 : 0) + (versionOk ? 0.5 : 0) + (via === "isrc" ? 1 : 0);
  return {
    url: `https://open.spotify.com/embed/${albumPost ? "album" : "track"}/${item.id}`,
    name, artist: item.artists.map((a) => a.name).join(", "), album: albumPost ? null : album,
    year: (albumPost ? item.release_date : item.album?.release_date)?.slice(0, 4) ?? null,
    via, titleOk: titleSim >= 0.85, artistOk, versionOk, score: Math.round(score * 100) / 100,
  };
}

const VERSION = { live: "live", acoustic: "acoustic", remix: "remix", demo: "demo", orchestral: "orchestral" };
const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1]) || Infinity;
const todo = data.posts.filter((p) => !p.editorMetadata.spotify_url && !p.editorMetadata.podcast_file && !results[p.id]).slice(0, limit);
console.log(`${todo.length} posts to search`);
let n = 0;
for (const post of todo) {
  const m = post.editorMetadata, c = context[post.id] ?? {};
  const performer = c.performer ?? m.artist, song = c.song ?? m.song, album = c.album ?? m.album;
  const albumPost = c.subject === "album" || !song;
  const title = albumPost ? album : song;
  if (!performer || !title || ["podcast", "other"].includes(c.subject)) { results[post.id] = { status: "none", reason: "no performer/title" }; continue; }
  const want = { performer, title, kind: VERSION[c.version] ?? null, albumPost };
  const found = [];
  if (!albumPost) for (const isrc of mb[post.id]?.isrcs ?? []) found.push(...(await searchApi("track", `isrc:${isrc}`)).map((t) => rank(t, want, "isrc")));
  const q = albumPost ? `album:${title} artist:${performer}` : `track:${title} artist:${performer}`;
  found.push(...(await searchApi(albumPost ? "album" : "track", q)).map((t) => rank(t, want, "search")));
  if (!found.some((f) => f.titleOk && f.artistOk)) found.push(...(await searchApi(albumPost ? "album" : "track", `${performer} ${title}`)).map((t) => rank(t, want, "loose")));
  const candidates = found.filter((f, i) => found.findIndex((o) => o.url === f.url) === i).sort((a, b) => b.score - a.score).slice(0, 8);
  const best = candidates[0];
  const ok = best && best.titleOk && best.artistOk && best.versionOk;
  results[post.id] = {
    title: post.title, performer, [albumPost ? "album" : "song"]: title, version: c.version ?? null,
    status: ok ? "auto" : best?.titleOk && best?.artistOk ? "review" : "none",
    pick: ok || (best?.titleOk && best?.artistOk) ? best.url : null, candidates,
  };
  if (++n % 10 === 0) { save(); console.log(`${n}/${todo.length}`); }
}
save();
const count = (s) => Object.values(results).filter((r) => r.status === s).length;
console.log(`Done: ${count("auto")} auto, ${count("review")} to review, ${count("none")} without a match -> ${REPORT}`);
