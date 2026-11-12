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
import { get, mentions, norm, phrase, plain, readData, readJson, search, similar, writeData, arid as aridOf, sameMbid, bareTitle, filmTitle } from "../lib/musicbrainz.js";
import { isVersion, KIND } from "../lib/versions.js";
import { report as reportFile } from "../lib/reports.js";
const VERSION = { test: isVersion };

const DECISIONS = reportFile("musicbrainz-posts-review.json");
// Release group id -> first release date (lookups; recording dates are unreliable: songs get re-released).
const GROUPS = reportFile("musicbrainz-release-groups.json");
const groups = readJson(GROUPS);
const apply = process.argv.includes("--apply");
const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice(8)) || Infinity;
const report = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? reportFile("musicbrainz-posts-candidates.json");
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
  for (const id of new Set([...Object.keys(results), ...Object.keys(decisions)])) {
    const r = results[id];
    const pick = id in decisions ? decisions[id].pick : r?.status === "auto" ? r.pick : null;
    const c = pick && (r?.candidates.find((c) => c.key === pick) ?? decisions[id]?.candidate);
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
    // A human decision (review UI or the editor, which stores the chosen candidate) always applies;
    // an automatic pick only while the post's artist id is still the one it was searched in.
    const r = results[post.id], d = decisions[post.id];
    if (!d && (!r || !sameMbid(r.arid, data.artists[post.metadata.artist]))) continue;
    const pick = d ? d.pick : r.status === "auto" ? r.pick : null;
    const c = pick && (r?.candidates.find((c) => c.key === pick) ?? d?.candidate);
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
  // A soundtrack isn't "another version" when the post is about that film ("BSO: X" is passed bare as "X").
  const film = c.secondary.includes("Soundtrack") && (/bso|banda sonora|soundtrack/i.test(album ?? "") || (album && c.album && close(filmTitle(c.album), album)));
  if (c.secondary.some((t) => OTHER_TYPES.has(t)) && !film) points -= 3;
  if (c.status && c.status !== "Official") points -= 2;
  if (album && norm(c.album) === norm(album)) points += 5;
  else if (album && c.album && (close(c.album, album) || close(filmTitle(c.album), album))) points += 3;
  if (c.isrcs?.length) points += 1;
  if (c.type === "Album") points += 1;
  return points;
}

// Recording search: one candidate per (recording, release group) pair.
// Exact phrase first; if nothing matches, unquoted terms (typos in the data) kept only when close.
async function recordings(arid, song, album, text, kind) {
  let found = (await search("recording", `recording:${phrase(song)} AND arid:${aridOf(arid)}`, 25))?.recordings ?? [];
  if (!found.length) found = ((await search("recording", `recording:${terms(song)} AND arid:${aridOf(arid)}`, 25))?.recordings ?? []).filter((r) => close(r.title, song));
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
  let found = (await search("release-group", `releasegroup:${phrase(album)} AND arid:${aridOf(arid)}`, 10))?.["release-groups"] ?? [];
  if (!found.length) found = (await search("release-group", `releasegroup:${terms(album)} AND arid:${aridOf(arid)}`, 10))?.["release-groups"] ?? [];
  return found.filter((g) => close(g.title, album) || close(filmTitle(g.title), album)).map((g) => ({
    key: `|${g.id}`, recording: null, release_group: g.id, title: null, disambiguation: g.disambiguation ?? null, length: null, isrcs: [],
    date: g["first-release-date"] ?? null, album: g.title, type: g["primary-type"] ?? null, secondary: g["secondary-types"] ?? [], status: null,
  })).map((c) => ({ ...c, points: rank(c, null, album, text, kind) }));
}

if (process.argv.includes("--resolve")) {
  // Last automatic pass for the posts left to review. Picks, in order:
  //   version   the best candidate that is the version the post presents (not just the top one)
  //   album     a candidate on the album the metadata or the text names
  //   original  the song's earliest official studio album (the metadata album differs: reported by musicbrainz-diffs)
  //   albumonly the post presents a version MusicBrainz doesn't have, or the song isn't found: the album alone
  //   cover     a cover whose metadata artist is the original: searched inside the cover's performer
  // Searches again with the text's album/song and looser titles (typos) when nothing fits. What still
  // has nothing is "notfound" (not in MusicBrainz); only posts with no single recording (podcasts,
  // lists: subject "other") are left out.
  const decisions = readJson(DECISIONS);
  const loose = (a, b) => !!a && !!b && (similar(a, b) >= 0.75 || similar(filmTitle(a), b) >= 0.75);
  const studio = (c) => !VERSION.test(c.disambiguation ?? "") && !c.secondary.some((t) => OTHER_TYPES.has(t) && t !== "Soundtrack") && (!c.status || c.status === "Official");
  // First release of a candidate's album (release group lookups, cached): the original, not a reissue
  // or a live album that happens to come first in the search. Main types first (album, single, EP).
  let soundtrack = false, kindNow = null, yearNow = null;   // set per post below
  const COMPILATION = /\b(hits?|best of|greatest|collection|colecci[oó]n|antolog[ií]a|anthology|essential|lo mejor|grandes [eé]xitos|[eé]xitos|vol\.?|volume|jahre|top \d+|\d+ top|duets|years|a[nñ]os|todo|complete|recopilatorio|sus mejores)\b/i;
  // The song on an album or single of the artist first released around the post's year (the metadata
  // year is usually the original's): found by album, then the song looked up inside it.
  async function aroundYear(arid, song, year, kind, albums = []) {
    if (!/^\d{4}$/.test(year ?? "")) return null;
    const groupsFound = (await search("release-group", `arid:${aridOf(arid)} AND (primarytype:album OR primarytype:single OR primarytype:ep) AND firstreleasedate:[${+year - 1} TO ${+year + 1}]`, 25))?.["release-groups"] ?? [];
    // The album the post names first, if it's among them.
    const named = (g) => albums.some((a) => similar(g.title, a) >= 0.85);
    const ordered = groupsFound.filter((g) => !(g["secondary-types"] ?? []).some((t) => t !== "Soundtrack" || !soundtrack) && !COMPILATION.test(g.title) && (kind || !KIND.live.re.test(g.title))).sort((a, b) => named(b) - named(a));
    for (const g of ordered.slice(0, 6)) {
      const items = (await search("recording", `recording:${terms(song)} AND rgid:${g.id}`, 10))?.recordings ?? [];
      const rec = items.find((x) => (loose(x.title, song) || norm(x.title).startsWith(`${norm(song)} `)) && (kind ? KIND[kind].re.test(x.disambiguation ?? "") : !VERSION.test(x.disambiguation ?? "")));
      if (rec) { groups[g.id] ??= g["first-release-date"] || null; return { key: `${rec.id}|${g.id}`, recording: rec.id, release_group: g.id, title: rec.title, disambiguation: rec.disambiguation ?? null,
        isrcs: rec.isrcs ?? [], length: rec.length ?? null, date: g["first-release-date"] ?? null, album: g.title, type: g["primary-type"] ?? null, secondary: g["secondary-types"] ?? [], status: null, points: 0 }; }
    }
    return null;
  }
  async function earliest(pool, any = false) {
    // Soundtracks only count as the first release when the post is about a film's music.
    // Compilations MusicBrainz files as plain albums are told apart by their title.
    const main = pool.filter((c) => ["Album", "Single", "EP"].includes(c.type) && c.secondary.every((t) => t === "Soundtrack" && soundtrack) && !COMPILATION.test(c.album ?? ""));
    const list = (main.length || !any ? main : pool).filter((c) => kindNow || !KIND.live.re.test(c.album ?? "")).slice(0, 8);
    for (const c of list) if (!(c.release_group in groups)) groups[c.release_group] = (await get(`release-group/${c.release_group}`))?.["first-release-date"] || null;
    // Never years after the post's own year: that's a reissue or a compilation, not the original.
    const fits = list.filter((c) => !yearNow || !groups[c.release_group] || +groups[c.release_group].slice(0, 4) <= yearNow + 3);
    return fits.sort((a, b) => (groups[a.release_group] || "9999").localeCompare(groups[b.release_group] || "9999"))[0];
  }
  // --again: redo the posts it already settled by "original" (after a rule change)
  if (process.argv.includes("--again")) for (const r of Object.values(results)) if (r.resolved && (["original", "recording", "albumonly"].includes(r.via) || r.status === "review" || (r.status === "notfound" && !r.via))) { r.resolved = false; r.status = "review"; delete r.via; }
  const todo = Object.entries(results).filter(([id, r]) => r.status === "review" && !(id in decisions) && !r.resolved).slice(0, limit);
  console.log(`${todo.length} posts to resolve`);
  let n = 0;
  for (const [id, r] of todo) {
    const post = posts.find((p) => p.id === id);
    if (!post) continue;
    r.resolved = true;
    const ctx = CONTEXT[id] ?? {}, text = plain(post.content);
    if (["podcast", "other"].includes(ctx.subject)) { r.status = "notfound"; r.via = "no single recording"; continue; }
    const kind = KIND[ctx.version] ? ctx.version : null;
    const song = post.metadata.song, metaAlbum = bareTitle(post.metadata.album);
    const albums = [metaAlbum, ctx.album && bareTitle(ctx.album)].filter(Boolean);
    let arid = r.arid;
    // A cover by someone else than the metadata artist: the performer's own recording.
    if (ctx.is_cover && ctx.performer && similar(ctx.performer, r.artist) < 0.8) {
      const pid = data.artists[ctx.performer] ?? (((await search("artist", `artist:${phrase(ctx.performer)}`, 5))?.artists ?? []).filter((a) => norm(a.name) === norm(ctx.performer)).length === 1
        ? (await search("artist", `artist:${phrase(ctx.performer)}`, 5)).artists.find((a) => norm(a.name) === norm(ctx.performer)).id : null);
      if (!pid) { r.status = "notfound"; r.via = "cover by an artist not in MusicBrainz"; continue; }
      arid = pid;
      r.performerArid = pid;
      r.candidates = song ? await recordings(pid, song, albums[0], text, kind) : [];
    }
    // More candidates: the text's own song/album, and looser titles.
    const more = [];
    if (song && !r.candidates.some((c) => c.recording && loose(c.title, song))) {
      const found = (await search("recording", `recording:${terms(song)} AND arid:${aridOf(arid)}`, 25))?.recordings ?? [];
      for (const rec of found.filter((x) => loose(x.title, song))) more.push(...(await recordings(arid, rec.title, albums[0], text, kind)));
      if (ctx.song && norm(ctx.song) !== norm(song)) more.push(...(await recordings(arid, ctx.song, albums[0], text, kind)));
    }
    for (const album of albums) if (!r.candidates.concat(more).some((c) => c.album && loose(c.album, album))) {
      const found = await releaseGroups(arid, album, text, kind);
      // Not inside the artist: credited to a group under their name ("Exodus" is by "Bob Marley & The Wailers").
      if (!found.length) {
        const groupsFound = (await search("release-group", `releasegroup:${phrase(album)} AND artist:${phrase(r.artist)}`, 10))?.["release-groups"] ?? [];
        for (const g of groupsFound.filter((g) => similar(g.title, album) >= 0.85 && (g["artist-credit"] ?? []).some((c) => norm(c.name ?? c.artist?.name).includes(norm(r.artist)))))
          found.push({ key: `|${g.id}`, recording: null, release_group: g.id, title: null, disambiguation: null, length: null, isrcs: [], date: g["first-release-date"] ?? null,
            album: g.title, type: g["primary-type"] ?? null, secondary: g["secondary-types"] ?? [], status: null, points: 0 });
      }
      more.push(...found);
    }
    r.candidates = [...r.candidates, ...more].filter((c, i, all) => all.findIndex((o) => o.key === c.key) === i).sort((a, b) => b.points - a.points);
    const cands = r.candidates;
    const titleOk = (c) => !song || (c.title && (loose(c.title, song) || (ctx.song && loose(c.title, ctx.song))));
    const versionOk = (c) => (kind ? matchesKind(c, kind) : studio(c));
    const onAlbum = (c) => c.album && albums.some((a) => similar(c.album, a) >= 0.85 || similar(filmTitle(c.album), a) >= 0.85);
    const set = (c, via) => { r.pick = c.key; r.status = "auto"; r.via = via; if (!cands.includes(c)) cands.unshift(c); };
    const albumOnly = (c) => ({ ...c, key: `|${c.release_group}`, recording: null, title: null, isrcs: [], disambiguation: null });
    const songs = cands.filter((c) => c.recording && titleOk(c));
    kindNow = kind; yearNow = /^\d{4}$/.test(post.metadata.year ?? "") ? +post.metadata.year : null;
    soundtrack = post.metadata.category === "Bandas Sonoras Originales" || !!ctx.soundtrack_of || /\b(bso|ost|soundtrack|banda sonora)\b/i.test(post.metadata.album ?? "");
    let pick = songs.find((c) => versionOk(c) && onAlbum(c))
      ?? (!song && cands.find((c) => c.release_group && onAlbum(c)));
    // The album the post names is there but the song wasn't paired with it: look for the song on that album.
    if (!pick && song) for (const g of cands.filter((c) => c.release_group && onAlbum(c)).filter((c, i, all) => all.findIndex((o) => o.release_group === c.release_group) === i).slice(0, 3)) {
      const items = (await search("recording", `recording:${terms(song)} AND rgid:${g.release_group}`, 10))?.recordings ?? [];
      const rec = items.find((x) => (loose(x.title, song) || norm(x.title).startsWith(`${norm(song)} `)) && (kind ? KIND[kind].re.test(`${x.disambiguation ?? ""} ${g.album}`) || g.secondary.includes(KIND[kind].type) : !VERSION.test(x.disambiguation ?? "")));
      if (rec) { pick = { ...g, key: `${rec.id}|${g.release_group}`, recording: rec.id, title: rec.title, disambiguation: rec.disambiguation ?? null, isrcs: rec.isrcs ?? [], length: rec.length ?? null }; break; }
    }
    if (pick) set(pick, song ? (kind ? "version" : "album") : "album");
    else if (songs.some(versionOk)) {
      // The song is there in the right version, on another album: its first release (album, single or EP).
      const original = (await aroundYear(r.performerArid ?? arid, song, post.metadata.year, kind, albums)) ?? await earliest(songs.filter((c) => versionOk(c) && c.release_group));
      if (original) set(original, "original");
    }
    // Nothing reliable for the song: the album the post names, alone, if MusicBrainz has it.
    if (r.status !== "auto") { const named = cands.find((c) => c.release_group && onAlbum(c) && !c.secondary.includes("Compilation") && !COMPILATION.test(c.album)); if (named) set(albumOnly(named), "albumonly"); }
    if (r.status === "auto") { /* settled above */ }
    else if (!kind && songs.some((c) => c.release_group && !matchesKind(c, "live") && !VERSION.test(c.disambiguation ?? ""))) {
      // Only on compilations and the like: still the same recording; its first release.
      const first = await earliest(songs.filter((c) => c.release_group && !matchesKind(c, "live") && !VERSION.test(c.disambiguation ?? "")), true);
      // The compilation isn't the song's album: link the recording alone.
      if (first) set({ ...first, key: `${first.recording}|`, release_group: null, album: null }, "recording");
    } else {
      // No such version (or the song isn't found): the album alone, if it's there.
      const album = cands.find((c) => c.release_group && onAlbum(c) && (!c.recording || !kind || !matchesKind(c, kind)));
      if (album) set(albumOnly(album), "albumonly");
      else if (song && songs.length && kind) {
        const base = songs.filter(studio).sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"))[0];
        if (base?.release_group) set(albumOnly(base), "albumonly");
      }
    }
    // A version MusicBrainz doesn't have (only other takes of the song): the album of its first release.
    if (r.status !== "auto" && song && kind && songs.length) { const first = await earliest(songs.filter((c) => c.release_group), true); if (first) set(albumOnly(first), "albumonly"); }
    if (r.status !== "auto") r.status = "notfound";
    if (r.status !== "auto" && r.status !== "notfound" && !r.candidates.some((c) => titleOk(c) || onAlbum(c))) r.status = "notfound";
    if (++n % 10 === 0) { save(); console.log(`${n}/${todo.length}`); }
  }
  save();
  writeFileSync(GROUPS, JSON.stringify(groups, null, 2) + "\n");
  await lookupDates();
  const st = (s) => todo.filter(([, r]) => r.status === s).length;
  console.log(`Resolve done: ${st("auto")} auto, ${st("notfound")} not in MusicBrainz, ${st("review")} left to review`);
  process.exit(0);
}

const todo = posts.filter((p) => data.artists[p.metadata.artist] && (p.metadata.song || p.metadata.album)
  && !sameMbid(results[p.id]?.arid, data.artists[p.metadata.artist])).slice(0, limit);
console.log(`${todo.length} posts to search (${Object.keys(results).length} already in ${report})`);
let done = 0;
for (const post of todo) {
  const { artist, song } = post.metadata, metaAlbum = bareTitle(post.metadata.album);
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
  const albumOk = !metaAlbum || (top?.album && Math.max(similar(top.album, metaAlbum), similar(filmTitle(top.album), metaAlbum)) >= 0.85);
  // Podcasts and other posts don't present one recording; covers by someone else need a human.
  const contextOk = !["podcast", "other"].includes(ctx.subject) && !coverConflict;
  candidates = candidates.slice(0, 12).map((c) => ({ ...c, mentioned: !!(c.album && mentions(text, c.album)) }));
  results[post.id] = {
    arid, artist, song: song ?? null, album: post.metadata.album ?? null, year: post.metadata.year ?? null, title: post.title, context: CONTEXT[post.id] ?? null,
    pick: top?.key ?? null, status: top && titleOk && albumOk && contextOk && (song ? top.recording : top.release_group) ? "auto" : "review", candidates,
  };
  if (++done % 10 === 0) { save(); console.log(`${done}/${todo.length}`); }
}
save();

await lookupDates();

const all = Object.values(results);
console.log(`Done: ${all.filter((r) => r.status === "auto").length} auto, ${all.filter((r) => r.status === "review").length} to review`);
