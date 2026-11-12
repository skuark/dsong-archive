// Second MusicBrainz pass: for each post whose artist already has an MBID (data/musicbrainz.json,
// from match-musicbrainz.mjs), finds the recording (song) and release group (album), searching
// only inside that artist. Gives ISRCs (cross-platform players), the album and its first release.
// Usage:
//   node scripts/match-musicbrainz-posts.mjs [report.json]          search (resumable: skips posts already
//                                                                    searched with the same artist MBID)
//   node scripts/match-musicbrainz-posts.mjs --limit=N [report.json] search only N posts (for testing)
//   node scripts/match-musicbrainz-posts.mjs --apply [report.json]  write matches to data/musicbrainz.json (posts)
// "auto" = same title, a studio version and (if the post names one) the same album; otherwise "review"
// (decide in `npm run review-musicbrainz`, tab "Canciones"; decisions win on --apply).
import { readFileSync, writeFileSync } from "node:fs";
import { get, mentions, norm, phrase, plain, readData, readJson, search, writeData } from "../lib/musicbrainz.js";
import { isVersion, KIND } from "../lib/versions.js";
const VERSION = { test: isVersion };

const DECISIONS = "musicbrainz-posts-review.json";
// Release group id -> first release date (lookups; recording dates are unreliable: songs get re-released).
const GROUPS = "musicbrainz-release-groups.json";
const groups = readJson(GROUPS);
const apply = process.argv.includes("--apply");
const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice(8)) || Infinity;
const report = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "musicbrainz-posts-candidates.json";
const posts = JSON.parse(readFileSync(new URL("../data/posts.json", import.meta.url), "utf8")).posts;
const data = readData();
const results = readJson(report);
// What each post says it presents (read from its text by an LLM, data/post-context.json): the version
// (live, acoustic, remix…), whether it's a cover, the album the text names. Missing file = no hints.
const CONTEXT = readJson(new URL("../data/post-context.json", import.meta.url));
const matchesKind = (c, kind) => !!kind && (KIND[kind].re.test(c.disambiguation ?? "") || KIND[kind].re.test(c.album ?? "") || c.secondary.includes(KIND[kind].type));
const save = () => writeFileSync(report, JSON.stringify(results, null, 2) + "\n");

// First release date of every picked album (automatic picks and review decisions), looked up once.
async function lookupDates() {
  const decisions = readJson(DECISIONS);
  const picked = new Set();
  for (const [id, r] of Object.entries(results)) {
    const pick = id in decisions ? decisions[id].pick : r.status === "auto" ? r.pick : null;
    const c = pick && (r.candidates.find((c) => c.key === pick) ?? decisions[id]?.candidate);
    if (c?.release_group && !(c.release_group in groups)) picked.add(c.release_group);
  }
  if (picked.size) console.log(`${picked.size} album dates to look up`);
  let n = 0;
  for (const id of picked) {
    groups[id] = (await get(`release-group/${id}`))?.["first-release-date"] || null;
    if (++n % 25 === 0 || n === picked.size) writeFileSync(GROUPS, JSON.stringify(groups, null, 2) + "\n");
  }
}

if (apply) {
  // Decisions: { pick: "<recording>|<release group>" } or { pick: null } (no match).
  await lookupDates();
  const decisions = readJson(DECISIONS);
  const out = {};
  for (const post of posts) {
    const r = results[post.id];
    if (!r || r.arid !== data.artists[post.metadata.artist]) continue;   // artist changed since: stale
    const pick = post.id in decisions ? decisions[post.id].pick : r.status === "auto" ? r.pick : null;
    const c = pick && (r.candidates.find((c) => c.key === pick) ?? decisions[post.id]?.candidate);
    if (!c) continue;
    out[post.id] = Object.fromEntries(Object.entries({
      recording: c.recording, release_group: c.release_group, isrcs: c.isrcs?.length ? c.isrcs : undefined, first_release: (c.release_group && groups[c.release_group]) || undefined,
    }).filter(([, v]) => v));
  }
  writeData({ ...data, posts: out });
  console.log(`${Object.keys(out).length} posts with a recording or album -> data/musicbrainz.json`);
  process.exit(0);
}

// Versions that aren't the studio original (unless the post's own title says so).
const OTHER_TYPES = new Set(["Live", "Compilation", "Remix", "Demo", "DJ-mix", "Mixtape/Street", "Interview", "Spokenword", "Soundtrack"]);

// Bigram similarity (0–1) of two normalized titles, tolerant of typos ("Devil & Dust" ~ "Devils & Dust").
function similar(a, b) {
  const grams = (s) => { const g = []; for (let i = 0; i < s.length - 1; i++) g.push(s.slice(i, i + 2)); return g; };
  const x = grams(norm(a)), y = grams(norm(b));
  if (!x.length || !y.length) return norm(a) === norm(b) ? 1 : 0;
  let hits = 0; const pool = [...y];
  for (const g of x) { const i = pool.indexOf(g); if (i >= 0) { hits++; pool.splice(i, 1); } }
  return (2 * hits) / (x.length + y.length);
}
const close = (a, b) => similar(a, b) >= 0.8;
// Unquoted terms for the fuzzy fallback search (Lucene syntax characters dropped).
const terms = (s) => `(${norm(s) || s.replace(/[^\p{L}\p{N} ]/gu, " ")})`;

// `text`: the post itself (plain(content)). Naming the album or its year there backs a candidate,
// above all when the metadata has no album or a different one.
function rank(c, song, album, text = "", kind = null) {
  let points = 0;
  // The post presents a specific version: reward it, and don't penalize it as "not the original" below.
  if (kind) { if (matchesKind(c, kind)) return 6 + rank({ ...c, disambiguation: "", secondary: c.secondary.filter((t) => t !== KIND[kind].type) }, song, album, text); points -= 2; }
  if (c.album && mentions(text, c.album)) points += album && norm(c.album) === norm(album) ? 1 : 3;
  if (c.date && text.includes(` ${c.date.slice(0, 4)} `)) points += 1;
  if (song) points += norm(c.title) === norm(song) ? 4 : close(c.title, song) ? 2 : 0;
  if (VERSION.test(c.disambiguation ?? "") && !VERSION.test(song ?? "")) points -= 4;
  if (c.secondary.some((t) => OTHER_TYPES.has(t)) && !(c.secondary.includes("Soundtrack") && /bso|banda sonora|soundtrack/i.test(album ?? ""))) points -= 3;
  if (c.status && c.status !== "Official") points -= 2;
  if (album && norm(c.album) === norm(album)) points += 5;
  else if (album && c.album && close(c.album, album)) points += 3;
  if (c.isrcs?.length) points += 1;
  if (c.type === "Album") points += 1;
  return points;
}

// Recording search: one candidate per (recording, release group) pair.
// Exact phrase first; if nothing matches, unquoted terms (typos in the data) kept only when close.
async function recordings(arid, song, album, text, kind) {
  let found = (await search("recording", `recording:${phrase(song)} AND arid:${arid}`, 25))?.recordings ?? [];
  if (!found.length) found = ((await search("recording", `recording:${terms(song)} AND arid:${arid}`, 25))?.recordings ?? []).filter((r) => close(r.title, song));
  const out = [];
  for (const r of found) {
    if (norm(r.title) !== norm(song) && !close(r.title, song)) continue;
    const groups = new Map();
    for (const rel of r.releases ?? []) {
      const rg = rel["release-group"];
      if (!rg || groups.has(rg.id)) continue;
      groups.set(rg.id, { album: rg.title, type: rg["primary-type"] ?? null, secondary: rg["secondary-types"] ?? [], status: rel.status ?? null });
    }
    if (!groups.size) groups.set(null, { album: null, type: null, secondary: [], status: null });
    for (const [id, g] of groups) out.push({
      key: `${r.id}|${id ?? ""}`, recording: r.id, release_group: id, title: r.title, disambiguation: r.disambiguation ?? null,
      length: r.length ?? null, isrcs: r.isrcs ?? [], date: r["first-release-date"] ?? null, ...g,
    });
  }
  return out.map((c) => ({ ...c, points: rank(c, song, album, text, kind) }));
}

// Release group search, for posts about an album (no song) or when the song's releases miss the album.
async function releaseGroups(arid, album, text, kind) {
  let found = (await search("release-group", `releasegroup:${phrase(album)} AND arid:${arid}`, 10))?.["release-groups"] ?? [];
  if (!found.length) found = (await search("release-group", `releasegroup:${terms(album)} AND arid:${arid}`, 10))?.["release-groups"] ?? [];
  return found.filter((g) => close(g.title, album)).map((g) => ({
    key: `|${g.id}`, recording: null, release_group: g.id, title: null, disambiguation: g.disambiguation ?? null, length: null, isrcs: [],
    date: g["first-release-date"] ?? null, album: g.title, type: g["primary-type"] ?? null, secondary: g["secondary-types"] ?? [], status: null,
  })).map((c) => ({ ...c, points: rank(c, null, album, text, kind) }));
}

const todo = posts.filter((p) => data.artists[p.metadata.artist] && (p.metadata.song || p.metadata.album)
  && results[p.id]?.arid !== data.artists[p.metadata.artist]).slice(0, limit);
console.log(`${todo.length} posts to search (${Object.keys(results).length} already in ${report})`);
let done = 0;
for (const post of todo) {
  const { artist, song, album: metaAlbum } = post.metadata;
  const arid = data.artists[artist];
  const text = plain(post.content);
  const ctx = CONTEXT[post.id] ?? {};
  const kind = KIND[ctx.version] ? ctx.version : null;
  // The album the text names stands in when the metadata has none (ranking only; albumOk below uses the metadata).
  const album = metaAlbum ?? ctx.album ?? undefined;
  // A cover whose performer isn't the metadata artist: the search runs inside the wrong artist.
  const coverConflict = ctx.is_cover && ctx.performer && similar(ctx.performer, artist) < 0.8;
  let candidates = song ? await recordings(arid, song, album, text, kind) : [];
  // The album gets its own search when no recording is on it (or the post is about an album).
  if (album && !candidates.some((c) => norm(c.album) === norm(album))) {
    const groups = await releaseGroups(arid, album, text, kind);
    // With a song, pair the album with the best version of it found elsewhere (single, compilation…).
    const best = [...candidates].sort((x, y) => y.points - x.points)[0];
    candidates.push(...(best ? groups.map((g) => ({ ...best, key: `${best.recording}|${g.release_group}`, release_group: g.release_group,
      album: g.album, type: g.type, secondary: g.secondary, status: null, paired: true })).map((c) => ({ ...c, points: rank(c, song, album, text, kind) })) : groups));
  }
  // One per key (the album search can repeat a pair), best first; ties: earliest release (the original), then with ISRC.
  candidates = candidates.filter((c, i, all) => all.findIndex((o) => o.key === c.key) === i);
  candidates.sort((a, b) => b.points - a.points || (a.date || "9999").localeCompare(b.date || "9999"));
  const top = candidates[0];
  const titleOk = !song || (top?.title && similar(top.title, song) >= 0.85
    && (kind ? matchesKind(top, kind) : !(VERSION.test(top.disambiguation ?? "") && !VERSION.test(song))));
  // Close titles count: the artist is already fixed, so a near match is a typo in the data (reported apart).
  const albumOk = !metaAlbum || (top?.album && similar(top.album, metaAlbum) >= 0.85);
  // Podcasts and other posts don't present one recording; covers by someone else need a human.
  const contextOk = !["podcast", "other"].includes(ctx.subject) && !coverConflict;
  candidates = candidates.slice(0, 12).map((c) => ({ ...c, mentioned: !!(c.album && mentions(text, c.album)) }));
  results[post.id] = {
    arid, artist, song: song ?? null, album: metaAlbum ?? null, year: post.metadata.year ?? null, title: post.title, context: CONTEXT[post.id] ?? null,
    pick: top?.key ?? null, status: top && titleOk && albumOk && contextOk && (song ? top.recording : top.release_group) ? "auto" : "review", candidates,
  };
  if (++done % 10 === 0) { save(); console.log(`${done}/${todo.length}`); }
}
save();

await lookupDates();

const all = Object.values(results);
console.log(`Done: ${all.filter((r) => r.status === "auto").length} auto, ${all.filter((r) => r.status === "review").length} to review`);
