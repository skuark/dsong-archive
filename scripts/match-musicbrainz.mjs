// Matches each artist in posts.json to a MusicBrainz artist (MBID), the base for later metadata
// enrichment (Wikidata, ISRC, country, genre…). No API key; MusicBrainz allows 1 request/s.
// Usage:
//   node scripts/match-musicbrainz.mjs [report.json]          search (resumable: skips artists already in the report)
//   node scripts/match-musicbrainz.mjs --limit=N [report.json] search only N artists (for testing)
//   node scripts/match-musicbrainz.mjs --apply [report.json]  write matches to data/musicbrainz.json
// Each artist gets candidates from an artist search, confirmed by searching its songs and albums:
// "auto" = a candidate with the same name credited on one of them; otherwise "review"
// (decide in `npm run review-musicbrainz`, whose decisions win on --apply).
// Set MB_CONTACT (an email or URL) to send it in the User-Agent, as MusicBrainz asks.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const POSTS = new URL("../data/posts.json", import.meta.url);
const OUT = new URL("../data/musicbrainz.json", import.meta.url);
const DECISIONS = "musicbrainz-review.json";
const apply = process.argv.includes("--apply");
const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice(8)) || Infinity;
const report = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "musicbrainz-candidates.json";
const posts = JSON.parse(readFileSync(POSTS, "utf8")).posts;
const read = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {});
const results = read(report);
const save = () => writeFileSync(report, JSON.stringify(results, null, 2) + "\n");

// Accent, case, punctuation and leading "the" insensitive ("The strokes" = "Strokes").
export const norm = (s = "") => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/^the /, "");

// Artists grouped by normalized name, with the exact spellings used in posts.json.
const artists = {};
for (const { metadata: m } of posts) {
  if (!m.artist) continue;
  const a = (artists[norm(m.artist)] ??= { names: new Set(), songs: new Set(), albums: new Set(), nationality: new Set(), posts: 0 });
  a.names.add(m.artist);
  a.posts++;
  if (m.song) a.songs.add(m.song);
  if (m.album) a.albums.add(m.album);
  if (m.artist_nationality) a.nationality.add(m.artist_nationality);
}

if (apply) {
  // Output: exact artist name (as in posts.json) -> MBID. Review decisions ({ mbid: null } = no match) win.
  const decisions = read(DECISIONS);
  const out = {};
  for (const [key, r] of Object.entries(results)) {
    const mbid = key in decisions ? decisions[key].mbid : r.status === "auto" ? r.pick : null;
    if (!mbid) continue;
    for (const name of artists[key]?.names ?? []) out[name] = mbid;
  }
  const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b, "es")));
  writeFileSync(OUT, JSON.stringify({ artists: sorted }, null, 2) + "\n");
  console.log(`${Object.keys(sorted).length} artist names with an MBID -> data/musicbrainz.json`);
  process.exit(0);
}

const UA = `MetadataMatcher/0.1${process.env.MB_CONTACT ? ` ( ${process.env.MB_CONTACT} )` : ""}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function mb(entity, query, limit = 5) {
  const url = `https://musicbrainz.org/ws/2/${entity}?fmt=json&limit=${limit}&query=${encodeURIComponent(query)}`;
  for (let attempt = 0; attempt < 6; attempt++) {
    await sleep(Math.max(0, last + 1100 - Date.now()));
    last = Date.now();
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(30000) });
      if (res.ok) return res.json();
      if (res.status !== 503 && res.status !== 429) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (attempt === 5) throw e;
    }
    await sleep(2000 * (attempt + 1));
  }
  return null;
}
// Lucene phrase: only quotes and backslashes need escaping inside "…".
const q = (s) => `"${s.replace(/[\\"]/g, "\\$&")}"`;
const sameName = (artist, key) => [artist.name, artist["sort-name"], ...(artist.aliases ?? []).map((a) => a.name)]
  .some((n) => norm(n) === key || norm(n.replace(/^(.*), (the|los|las|el|la)$/i, "$2 $1")) === key);

// Artist ids credited on recordings/release groups matching one of the artist's songs or albums.
async function confirmations(name, entity, field, titles) {
  const hits = new Map();   // mbid -> { artist, titles }
  for (const title of titles) {
    const data = await mb(entity, `${field}:${q(title)} AND artist:${q(name)}`, 10);
    for (const item of data?.[entity === "recording" ? "recordings" : "release-groups"] ?? []) {
      if (norm(item.title) !== norm(title) && item.score < 95) continue;
      for (const credit of item["artist-credit"] ?? []) {
        if (!credit.artist) continue;
        const hit = hits.get(credit.artist.id) ?? { artist: credit.artist, titles: [] };
        if (!hit.titles.includes(title)) hit.titles.push(title);
        hits.set(credit.artist.id, hit);
      }
    }
    if (hits.size) break;
  }
  return hits;
}

const pending = Object.entries(artists).filter(([key]) => !results[key]).slice(0, limit);
console.log(`${pending.length} artists to search (${Object.keys(results).length} already in ${report})`);
let done = 0;
for (const [key, a] of pending) {
  const name = [...a.names][0];
  const found = await mb("artist", `artist:${q(name)} OR alias:${q(name)}`, 8);
  const candidates = (found?.artists ?? []).map((c) => ({
    mbid: c.id, name: c.name, score: c.score, type: c.type ?? null, country: c.country ?? null,
    area: c.area?.name ?? null, disambiguation: c.disambiguation ?? null,
    begin: c["life-span"]?.begin ?? null, end: c["life-span"]?.end ?? null,
    sameName: sameName(c, key), confirmed: [],
  }));
  // Confirm with up to 3 songs, then up to 3 albums (stops at the first one with hits).
  const songs = [...a.songs].slice(0, 3), albums = [...a.albums].filter((t) => norm(t) !== key).slice(0, 3);
  let hits = await confirmations(name, "recording", "recording", songs);
  if (![...hits.values()].some(({ artist }) => sameName(artist, key))) {
    for (const [id, hit] of await confirmations(name, "release-group", "releasegroup", albums)) {
      hits.set(id, { artist: hit.artist, titles: [...(hits.get(id)?.titles ?? []), ...hit.titles] });
    }
  }
  // Credited artists the artist search missed (e.g. a different spelling) become candidates too.
  for (const [id, { artist }] of hits) {
    if (!candidates.some((c) => c.mbid === id)) candidates.push({ mbid: id, name: artist.name, score: null, type: null, country: null,
      area: null, disambiguation: artist.disambiguation || null, begin: null, end: null, sameName: sameName(artist, key), confirmed: [] });
  }
  for (const c of candidates) c.confirmed = hits.get(c.mbid)?.titles ?? [];
  const confirmed = candidates.filter((c) => c.sameName && c.confirmed.length);
  const pick = confirmed.length === 1 ? confirmed[0] : candidates.find((c) => c.sameName) ?? null;
  results[key] = {
    names: [...a.names], posts: a.posts, songs: [...a.songs].slice(0, 5), albums: [...a.albums].slice(0, 5),
    nationality: [...a.nationality], pick: pick?.mbid ?? null,
    status: confirmed.length === 1 ? "auto" : "review", candidates,
  };
  if (++done % 10 === 0) { save(); console.log(`${done}/${pending.length}`); }
}
save();
const all = Object.values(results);
console.log(`Done: ${all.filter((r) => r.status === "auto").length} auto, ${all.filter((r) => r.status === "review").length} to review`);
