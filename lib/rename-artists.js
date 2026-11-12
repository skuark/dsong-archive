// Renames artists in posts.json data and keeps everything that hangs off the name consistent: the MusicBrainz
// link (data/musicbrainz.json `artists` and the review decisions, so --apply keeps it) and redirects from the
// old artist and album pages when no post builds them any more. Used by scripts/rename-artists.mjs and the
// editor (an artist changed in one post). Mutates its arguments; the caller writes the files.
//   renames: [{ from, to, mbid?: "<id>" | [{ name, mbid }], posts?: ["<id>", …] }]
//   "posts" limits the rename to those posts; "mbid" sets the link of the new name (default: the old name's
//   link, unless the new name already has one).
import { slugify } from "./posts.js";
import { norm } from "./musicbrainz.js";
import { resolveMetadata } from "./metadata.js";

const page = (name) => `/archive/artists/${slugify(name)}.html`;
// Album pages are per artist + album, as the site shows them (lib/posts.js: MusicBrainz's album title when it's
// accepted): renaming the artist moves them too.
const albumPageIn = (mb) => (p) => {
  const m = resolveMetadata(p, mb);
  return m.album ? `/archive/albums/${slugify([m.artist, m.album].filter(Boolean).join("-"))}.html` : null;
};

export function renameArtists(renames, { data, mb, decisions, redirects }) {
  const albumPage = albumPageIn(mb);
  const albumsBefore = new Map(data.posts.map((p) => [p.id, albumPage(p)]));
  const changed = [];
  for (const r of renames) {
    const targets = data.posts.filter((p) => p.editorMetadata.artist === r.from && (!r.posts || r.posts.includes(p.id)));
    if (!targets.length) throw new Error(`No posts with artist "${r.from}"${r.posts ? ` among ${r.posts.join(", ")}` : ""}`);
    for (const p of targets) p.editorMetadata.artist = r.to;
    const link = r.mbid ?? mb.artists[r.to] ?? mb.artists[r.from];
    if (link) { mb.artists[r.to] = link; decisions[norm(r.to)] = { mbid: link }; }
    const left = data.posts.some((p) => p.editorMetadata.artist === r.from);
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
  return changed;
}
