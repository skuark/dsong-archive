// Lists where posts.json disagrees with the MusicBrainz match (after match-musicbrainz-posts --apply):
// year vs the album's first release, and song/album titles that differ (typos, missing words).
// Read-only. Usage: node scripts/musicbrainz-diffs.mjs [out.md]  (default musicbrainz-diffs.md)
import { readFileSync, writeFileSync } from "node:fs";
import { bareTitle, filmTitle, norm, readData, readJson } from "../lib/musicbrainz.js";

const out = process.argv[2] ?? "musicbrainz-diffs.md";
const posts = JSON.parse(readFileSync(new URL("../data/posts.json", import.meta.url), "utf8")).posts;
const { posts: matched } = readData();
const report = readJson("musicbrainz-posts-candidates.json");
const decisions = readJson("musicbrainz-posts-review.json");

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
].join("\n");
writeFileSync(out, md);
console.log(`${rows.year.length} years, ${rows.song.length} song titles, ${rows.album.length} album titles differ -> ${out}`);
