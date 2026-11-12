// Matches each artist in posts.json to a MusicBrainz artist (MBID), the base for later metadata
// enrichment (Wikidata, ISRC, country, genre…). No API key; MusicBrainz allows 1 request/s.
// Usage:
//   node scripts/match-musicbrainz.mjs [report.json]          search (resumable: skips artists already in the report)
//   node scripts/match-musicbrainz.mjs --limit=N [report.json] search only N artists (for testing)
//   node scripts/match-musicbrainz.mjs --recheck [report.json] second pass for "review" artists: confirm each
//                                                              candidate by its id (catches "Enrique Bunbury" = "Bunbury")
//   node scripts/match-musicbrainz.mjs --apply [report.json]  write matches to data/musicbrainz.json
// Each artist gets candidates from an artist search, confirmed by searching its songs and albums:
// "auto" = a candidate with the same name credited on one of them; otherwise "review"
// (decide in `npm run review-musicbrainz`, whose decisions win on --apply).
import { readFileSync, writeFileSync } from "node:fs";
import { norm, phrase as q, readData, readJson as read, search as mb, writeData } from "../lib/musicbrainz.js";

const POSTS = new URL("../data/posts.json", import.meta.url);
const DECISIONS = "musicbrainz-review.json";
const apply = process.argv.includes("--apply");
const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice(8)) || Infinity;
const report = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "musicbrainz-candidates.json";
const posts = JSON.parse(readFileSync(POSTS, "utf8")).posts;
const results = read(report);
const save = () => writeFileSync(report, JSON.stringify(results, null, 2) + "\n");

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
  writeData({ ...readData(), artists: sorted });
  console.log(`${Object.keys(sorted).length} artist names with an MBID -> data/musicbrainz.json`);
  process.exit(0);
}

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

if (process.argv.includes("--recheck")) {
  // Up to 4 candidates (same name first, then by score), each searched by arid with 2 songs, then 2 albums.
  const todo = Object.entries(results).filter(([, r]) => r.status === "review" && !r.rechecked && r.candidates.length).slice(0, limit);
  console.log(`${todo.length} artists to recheck`);
  let done = 0;
  for (const [key, r] of todo) {
    const a = artists[key];
    const songs = [...(a?.songs ?? [])].slice(0, 2), albums = [...(a?.albums ?? [])].filter((t) => norm(t) !== key).slice(0, 2);
    const pool = [...r.candidates].sort((x, y) => y.sameName - x.sameName || (y.score ?? 0) - (x.score ?? 0)).slice(0, 4);
    for (const c of pool) {
      for (const [entity, field, titles] of [["recording", "recording", songs], ["release-group", "releasegroup", albums]]) {
        for (const title of titles) {
          const data = await mb(entity, `${field}:${q(title)} AND arid:${c.mbid}`, 5);
          const items = data?.[entity === "recording" ? "recordings" : "release-groups"] ?? [];
          if (items.some((i) => norm(i.title) === norm(title)) && !c.confirmed.includes(title)) c.confirmed.push(title);
        }
        if (c.confirmed.length) break;
      }
    }
    // Auto when exactly one candidate is confirmed and its name fits ("Bunbury" inside "Enrique Bunbury").
    const confirmed = r.candidates.filter((c) => c.confirmed.length);
    const fits = (c) => c.sameName || key.includes(norm(c.name)) || norm(c.name).includes(key);
    if (confirmed.length === 1 && fits(confirmed[0])) { r.pick = confirmed[0].mbid; r.status = "auto"; r.via = "recheck"; }
    else if (confirmed.length) r.pick = confirmed.sort((x, y) => y.confirmed.length - x.confirmed.length)[0].mbid;
    r.rechecked = true;
    if (++done % 10 === 0) { save(); console.log(`${done}/${todo.length}`); }
  }
  save();
  console.log(`Recheck done: ${todo.filter(([, r]) => r.status === "auto").length} of ${todo.length} now auto`);
  process.exit(0);
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
