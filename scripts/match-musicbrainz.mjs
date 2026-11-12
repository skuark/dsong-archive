// Matches each artist in posts.json to a MusicBrainz artist (MBID), the base for later metadata
// enrichment (Wikidata, ISRC, country, genre…). No API key; MusicBrainz allows 1 request/s.
// Usage:
//   node scripts/match-musicbrainz.mjs [report.json]          search (resumable: skips artists already in the report)
//   node scripts/match-musicbrainz.mjs --limit=N [report.json] search only N artists (for testing)
//   node scripts/match-musicbrainz.mjs --recheck [report.json] second pass for "review" artists: confirm each
//                                                              candidate by its id (catches "Enrique Bunbury" = "Bunbury")
//   node scripts/match-musicbrainz.mjs --split [report.json]   collaborations ("X y Y"): match each artist apart
//   node scripts/match-musicbrainz.mjs --apply [report.json]  write matches to data/musicbrainz.json
// Each artist gets candidates from an artist search, confirmed by searching its songs and albums:
// "auto" = a candidate with the same name credited on one of them; otherwise "review"
// (decide in `npm run review-musicbrainz`, whose decisions win on --apply).
import { readFileSync, writeFileSync } from "node:fs";
import { ALPHA2, get, mentions, norm, phrase as q, plain, readData, readJson as read, search as mb, splitArtists, writeData, bareTitle } from "../lib/musicbrainz.js";
import { countryOf } from "../lib/countries.js";

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
for (const { metadata: m, content } of posts) {
  if (!m.artist) continue;
  const a = (artists[norm(m.artist)] ??= { names: new Set(), songs: new Set(), albums: new Set(), nationality: new Set(), posts: 0, text: "" });
  a.text += plain(content);
  a.names.add(m.artist);
  a.posts++;
  if (m.song) a.songs.add(m.song);
  if (m.album) a.albums.add(bareTitle(m.album));
  if (m.artist_nationality) a.nationality.add(m.artist_nationality);
}

if (apply) {
  // Output: exact artist name (as in posts.json) -> MBID. Review decisions ({ mbid: null } = no match) win.
  const decisions = read(DECISIONS);
  const out = {};
  for (const key of new Set([...Object.keys(results), ...Object.keys(decisions)])) {
    const r = results[key];
    const mbid = key in decisions ? decisions[key].mbid : r?.status === "auto" ? r.pick : null;
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
    // What the posts themselves say: the candidate's albums named in the text, and the post's nationality.
    const country = [...(a?.nationality ?? [])].map((n) => ALPHA2[countryOf(n)?.code]).find(Boolean);
    for (const c of pool) {
      const groups = (await get(`release-group?artist=${c.mbid}&limit=100`))?.["release-groups"] ?? [];
      c.mentioned = [...new Set(groups.map((g) => g.title).filter((t) => mentions(a?.text ?? "", t)))].slice(0, 5);
      c.countryMatch = country && c.country ? c.country === country : null;
    }
    // Auto when exactly one candidate is confirmed and its name fits ("Bunbury" inside "Enrique Bunbury");
    // failing that, when the text names albums of exactly one same-name candidate whose country doesn't contradict.
    const confirmed = r.candidates.filter((c) => c.confirmed.length);
    const fits = (c) => c.sameName || key.includes(norm(c.name)) || norm(c.name).includes(key);
    const named = pool.filter((c) => fits(c) && c.mentioned?.length && c.countryMatch !== false);
    if (confirmed.length === 1 && fits(confirmed[0])) { r.pick = confirmed[0].mbid; r.status = "auto"; r.via = "recheck"; }
    else if (!confirmed.length && named.length === 1) { r.pick = named[0].mbid; r.status = "auto"; r.via = "content"; }
    // Failing both: one same-name candidate from the post's country, and every other same-name one from elsewhere.
    else if (!confirmed.length && !named.length && r.candidates.filter((c) => c.sameName).length > 1
      && r.candidates.filter((c) => c.sameName && c.countryMatch === true).length === 1
      && r.candidates.every((c) => !c.sameName || typeof c.countryMatch === "boolean")) {
      r.pick = r.candidates.find((c) => c.sameName && c.countryMatch === true).mbid; r.status = "auto"; r.via = "country";
    }
    else if (confirmed.length) r.pick = confirmed.sort((x, y) => y.confirmed.length - x.confirmed.length || (y.mentioned?.length ?? 0) - (x.mentioned?.length ?? 0))[0].mbid;
    else if (named.length) r.pick = named.sort((x, y) => y.mentioned.length - x.mentioned.length)[0].mbid;
    r.rechecked = true;
    if (++done % 10 === 0) { save(); console.log(`${done}/${todo.length}`); }
  }
  save();
  console.log(`Recheck done: ${todo.filter(([, r]) => r.status === "auto").length} of ${todo.length} now auto`);
  process.exit(0);
}

if (process.argv.includes("--split")) {
  // Collaborations credited as one name ("Enrique Morente y Lagartija Nick"), not an artist in MusicBrainz:
  // each part becomes its own artist (an already matched one, or a same-name search hit), stored as
  // [{ name, mbid }]. Auto when every part is found and a song/album of the posts is credited to them.
  const decisions = read(DECISIONS);
  const todo = Object.entries(results).filter(([key, r]) => r.status !== "auto" && !(key in decisions) && !r.split
    && splitArtists(r.names[0]).length > 1).slice(0, limit);
  console.log(`${todo.length} collaborations to split`);
  for (const [key, r] of todo) {
    const a = artists[key], parts = [];
    const titles = [["recording", "recording", [...(a?.songs ?? [])].slice(0, 3)], ["release-group", "releasegroup", [...(a?.albums ?? [])].slice(0, 3)]];
    const credited = async (ids) => {
      for (const [entity, field, list] of titles) for (const title of list) {
        const data = await mb(entity, `${field}:${q(title)} AND arid:${ids.length > 1 ? `(${ids.join(" OR ")})` : ids[0]}`, 5);
        if ((data?.[entity === "recording" ? "recordings" : "release-groups"] ?? []).some((i) => norm(i.title) === norm(title))) return title;
      }
      return null;
    };
    for (const name of splitArtists(r.names[0])) {
      const pk = norm(name);
      const known = decisions[pk]?.mbid ?? (results[pk]?.status === "auto" ? results[pk].pick : null);
      if (known && typeof known === "string") { parts.push({ name, mbid: known }); continue; }
      const same = ((await mb("artist", `artist:${q(name)} OR alias:${q(name)}`, 8))?.artists ?? []).filter((c) => sameName(c, pk));
      let hit = same.length === 1 ? same[0] : null;
      if (same.length > 1) { const ok = []; for (const c of same.slice(0, 4)) if (await credited([c.id])) ok.push(c); if (ok.length === 1) hit = ok[0]; }
      parts.push({ name, mbid: hit?.id ?? null });
    }
    r.split = parts;
    if (parts.every((p) => p.mbid)) {
      r.pick = parts;
      r.confirmedBy = await credited(parts.map((p) => p.mbid));
      if (r.confirmedBy) { r.status = "auto"; r.via = "split"; }
    }
    console.log(`${r.names[0]}: ${parts.map((p) => `${p.name}=${p.mbid ?? "?"}`).join(", ")} -> ${r.status}`);
  }
  save();
  console.log(`Split done: ${todo.filter(([, r]) => r.status === "auto").length} of ${todo.length} now auto`);
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
