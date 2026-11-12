// Lists where posts.json disagrees with the MusicBrainz match (after match-musicbrainz-posts --apply):
// year vs the album's first release, and song/album titles that differ (typos, missing words); with
// musicbrainz-artists.json (scripts/musicbrainz-artists.mjs), also per artist: name, nationality, official
// site and, for posts without one, MusicBrainz's genres.
// Read-only. Usage: node scripts/musicbrainz-diffs.mjs [out.md]  (default musicbrainz-diffs.md)
import { readFileSync, writeFileSync } from "node:fs";
import { ALPHA2, bareTitle, filmTitle, norm, readData, readJson } from "../lib/musicbrainz.js";
import { COUNTRIES, countryOf } from "../lib/countries.js";
import { report as reportFile } from "../lib/reports.js";

const out = process.argv[2] ?? reportFile("musicbrainz-diffs.md");
const posts = JSON.parse(readFileSync(new URL("../data/posts.json", import.meta.url), "utf8")).posts;
const { posts: matched, artists: linked } = readData();
const report = readJson(reportFile("musicbrainz-posts-candidates.json"));
const decisions = readJson(reportFile("musicbrainz-posts-review.json"));

const rows = { year: [], song: [], album: [] };
for (const post of posts) {
  const m = matched[post.id], r = report[post.id];
  if (!m || !r) continue;
  const pick = post.id in decisions ? decisions[post.id].pick : r.pick;
  const c = r.candidates.find((c) => c.key === pick) ?? decisions[post.id]?.candidate;
  const { song, album, year } = post.metadata;
  const link = `[${post.id}](https://dsong.es/archive/${post.id}.html)`;
  const mbYear = m.first_release?.slice(0, 4);
  if (year && mbYear && year !== mbYear) rows.year.push(`| ${link} | ${album ?? ""} | ${year} | ${mbYear} |`);
  if (song && c?.title && norm(c.title) !== norm(song)) rows.song.push(`| ${link} | ${song} | ${c.title} |`);
  if (album && c?.album && norm(c.album) !== norm(bareTitle(album)) && norm(filmTitle(c.album)) !== norm(bareTitle(album))) rows.album.push(`| ${link} | ${album} | ${c.album} |`);
}

// ---------- Artists ----------
const info = readJson(reportFile("musicbrainz-artists.json"));
const artistRows = { name: [], country: [], countryMissing: [], url: [], urlMissing: [], genre: [] };
const NAME_OF = Object.fromEntries(Object.entries(ALPHA2).map(([code, a2]) => [a2, COUNTRIES[code] ?? a2]));
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const byArtist = new Map();
for (const post of posts) if (post.metadata.artist) (byArtist.get(post.metadata.artist) ?? byArtist.set(post.metadata.artist, []).get(post.metadata.artist)).push(post);
for (const [name, list] of byArtist) {
  const mbid = linked[name];
  if (!mbid || Array.isArray(mbid) || !info[mbid]) continue;   // collaborations: their parts aren't one artist
  const a = info[mbid], mb = `[${a.name}](https://musicbrainz.org/artist/${mbid})`, count = list.length;
  // Name: neither the canonical name nor an alias (typos, other spellings)
  const known = [a.name, a.sort, ...a.aliases].filter(Boolean).map(norm);
  if (!known.includes(norm(name)) && !known.includes(norm(name.replace(/^(.*), (the|los|las|el|la)$/i, "$2 $1")))) artistRows.name.push(`| ${name} | ${mb} | ${count} |`);
  // Nationality
  const ours = [...new Set(list.map((p) => p.metadata.artist_nationality).filter(Boolean))];
  const codes = [...new Set(ours.map((n) => ALPHA2[countryOf(n)?.code]).filter(Boolean))];
  if (a.country && a.country !== "XW" && a.country !== "XE") {
    if (!ours.length) artistRows.countryMissing.push(`| ${name} | ${mb} | ${NAME_OF[a.country] ?? a.country} | ${count} |`);
    else if (codes.length && !codes.includes(a.country)) artistRows.country.push(`| ${name} | ${ours.join(", ")} | ${mb}: ${NAME_OF[a.country] ?? a.country}${a.area && a.area !== (NAME_OF[a.country] ?? a.country) ? ` (${a.area})` : ""} | ${count} |`);
  }
  // Official site
  const sites = [...new Set(list.map((p) => p.metadata.artist_url).filter(Boolean))];
  if (a.urls.official) {
    if (!sites.length) artistRows.urlMissing.push(`| ${name} | ${a.urls.official} | ${count} |`);
    else if (!sites.some((u) => host(u) === host(a.urls.official))) artistRows.url.push(`| ${name} | ${sites.join("<br>")} | ${a.urls.official} | ${count} |`);
  }
  // Genre, only where the post has none (ours are free text in Spanish)
  const noGenre = list.filter((p) => !p.metadata.genre).length;
  if (noGenre && a.genres.length) artistRows.genre.push(`| ${name} | ${a.genres.join(", ")} | ${noGenre} |`);
}
const artistMd = !Object.keys(info).length ? [`_Run \`node scripts/musicbrainz-artists.mjs\` to compare artists too._`, ``] : [
  `## Artist name ≠ MusicBrainz name or alias (${artistRows.name.length})`,
  ``, `| posts.json | MusicBrainz | Posts |`, `|---|---|---|`, ...artistRows.name, ``,
  `## Nationality ≠ MusicBrainz country (${artistRows.country.length})`,
  ``, `| Artist | posts.json | MusicBrainz | Posts |`, `|---|---|---|---|`, ...artistRows.country, ``,
  `## Nationality missing, MusicBrainz has it (${artistRows.countryMissing.length})`,
  ``, `| Artist | MusicBrainz | Country | Posts |`, `|---|---|---|---|`, ...artistRows.countryMissing, ``,
  `## Website ≠ MusicBrainz official site (${artistRows.url.length})`,
  ``, `| Artist | posts.json | MusicBrainz | Posts |`, `|---|---|---|---|`, ...artistRows.url, ``,
  `## Website missing, MusicBrainz has it (${artistRows.urlMissing.length})`,
  ``, `| Artist | MusicBrainz | Posts |`, `|---|---|---|`, ...artistRows.urlMissing, ``,
  `## Genre missing: MusicBrainz genres (${artistRows.genre.length})`,
  ``, `| Artist | MusicBrainz genres | Posts without genre |`, `|---|---|---|`, ...artistRows.genre, ``,
];

const md = [
  `# posts.json vs MusicBrainz`,
  ``,
  `${Object.keys(matched).length} posts matched. Differences don't mean dSong is wrong: check before fixing.`,
  ``,
  `## Year ≠ album's first release (${rows.year.length})`,
  ``, `| Post | Album | posts.json | MusicBrainz |`, `|---|---|---|---|`, ...rows.year,
  ``,
  `## Song title (${rows.song.length})`,
  ``, `| Post | posts.json | MusicBrainz |`, `|---|---|---|`, ...rows.song,
  ``,
  `## Album title (${rows.album.length})`,
  ``, `| Post | posts.json | MusicBrainz |`, `|---|---|---|`, ...rows.album,
  ``,
  ...artistMd,
].join("\n");
writeFileSync(out, md);
console.log(`${rows.year.length} years, ${rows.song.length} song titles, ${rows.album.length} album titles differ`
  + (Object.keys(info).length ? `; artists: ${artistRows.name.length} names, ${artistRows.country.length} nationalities (+${artistRows.countryMissing.length} missing), ${artistRows.url.length} sites (+${artistRows.urlMissing.length} missing), ${artistRows.genre.length} genre suggestions` : "") + ` -> ${out}`);
