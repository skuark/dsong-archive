// Renames artists in posts.json (typos, a film title used as artist, two artists under one name) and keeps
// everything that hangs off the name consistent: the MusicBrainz link (data/musicbrainz.json and the review
// decisions, so --apply keeps it) and redirects from the old artist and album pages when they disappear.
// Usage: node scripts/rename-artists.mjs renames.json
//   renames.json: [{ "from": "Eric Jonhson", "to": "Eric Johnson", "mbid"?: "<id>" | [{ name, mbid }], "posts"?: ["<id>", …] }]
//   "posts" limits the rename to those posts (splitting one name into two artists); "mbid" sets the link of
//   the new name (default: the old name's link, unless the new name already has one).
import { readFileSync, writeFileSync } from "node:fs";
import { serializePosts } from "../lib/validate-post.js";
import { slugify } from "../lib/posts.js";
import { norm, readData, readJson, writeData } from "../lib/musicbrainz.js";
import { report as reportFile } from "../lib/reports.js";

const POSTS = new URL("../data/posts.json", import.meta.url);
const REDIRECTS = new URL("../data/redirects.json", import.meta.url);
const renames = JSON.parse(readFileSync(process.argv[2], "utf8"));
const data = JSON.parse(readFileSync(POSTS, "utf8"));
const redirects = JSON.parse(readFileSync(REDIRECTS, "utf8"));
const mb = readData();
const decisions = readJson(reportFile("musicbrainz-review.json"));
const page = (name) => `/archive/artists/${slugify(name)}.html`;
// Album pages are per artist + album (lib/posts.js): renaming the artist moves them too.
const albumPage = (p) => (p.metadata.album ? `/archive/albums/${slugify([p.metadata.artist, p.metadata.album].filter(Boolean).join("-"))}.html` : null);
const albumsBefore = new Map(data.posts.map((p) => [p.id, albumPage(p)]));

const changed = [];
for (const r of renames) {
  const targets = data.posts.filter((p) => p.metadata.artist === r.from && (!r.posts || r.posts.includes(p.id)));
  if (!targets.length) throw new Error(`No posts with artist "${r.from}"${r.posts ? ` among ${r.posts.join(", ")}` : ""}`);
  for (const p of targets) p.metadata.artist = r.to;
  const link = r.mbid ?? mb.artists[r.to] ?? mb.artists[r.from];
  if (link) { mb.artists[r.to] = link; decisions[norm(r.to)] = { mbid: link }; }
  const left = data.posts.some((p) => p.metadata.artist === r.from);
  if (!left) {
    delete mb.artists[r.from];
    // The old artist page is gone: send it to the new one (unless it's the same URL).
    if (page(r.from) !== page(r.to) && !redirects.some((x) => x.from === page(r.from))) redirects.push({ from: page(r.from), to: page(r.to) });
  }
  changed.push(`${r.from} -> ${r.to} (${targets.length} posts${left ? ", the rest keep the old name" : ""})`);
}
// Old album pages no post builds any more -> the album's new page.
const albumsAfter = new Set(data.posts.map(albumPage).filter(Boolean));
for (const p of data.posts) {
  const before = albumsBefore.get(p.id), after = albumPage(p);
  if (before && before !== after && !albumsAfter.has(before) && !redirects.some((x) => x.from === before)) redirects.push({ from: before, to: after });
}
mb.artists = Object.fromEntries(Object.entries(mb.artists).sort(([a], [b]) => a.localeCompare(b, "es")));
writeFileSync(POSTS, serializePosts(data));
writeFileSync(REDIRECTS, JSON.stringify(redirects, null, 2) + "\n");
writeData(mb);
writeFileSync(reportFile("musicbrainz-review.json"), JSON.stringify(decisions, null, 2) + "\n");
console.log(changed.join("\n"));
