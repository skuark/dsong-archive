import { readFileSync, statSync } from "node:fs";
import slugifyLib from "@sindresorhus/slugify";
import { countryOf } from "./countries.js";
import { resolveMetadata } from "./metadata.js";

// posts.json is read with fs (an `import` would stay cached across rebuilds) and parsed again only
// when it (or musicbrainz.json) changes on disk, so `npm run serve` picks up edits (e.g. from `npm run edit`).
const FILE = new URL("../data/posts.json", import.meta.url);
const MUSICBRAINZ = new URL("../data/musicbrainz.json", import.meta.url);

// Same options as Eleventy's `slugify` filter, so URLs stay stable.
// Pinned to v2: v4 changes some slugs (e.g. "writer-s-block" -> "writers-block").
const slugCache = new Map();
export function slugify(str) {
  const key = String(str);
  if (!slugCache.has(key)) slugCache.set(key, slugifyLib(key, { decamelize: false }));
  return slugCache.get(key);
}

const has = (value) => value !== undefined && value !== null && value !== "";

// Archive facets. `name` returns the group label, or undefined if the post has no value.
const FACETS = {
  editor: (post) => post.editor.name,
  artist: (post) => post.metadata.artist,
  album: (post) => has(post.metadata.album)
    ? [post.metadata.artist, post.metadata.album].filter(has).join("-")
    : undefined,
  year: (post) => post.metadata.year,
  category: (post) => post.metadata.category,
  country: (post) => countryOf(post.metadata.artist_nationality)?.name,   // normalized (lib/countries.js)
};

// Each post gets `slugs.<facet>` (only when it has a value) for linking.
const withSlugs = (post) => {
  const slugs = {};
  for (const [facet, name] of Object.entries(FACETS)) {
    const value = name(post);
    if (has(value)) slugs[facet] = slugify(value);
  }
  return { ...post, slugs };
};

// Each post's `metadata` is resolved from `editorMetadata` and MusicBrainz (lib/metadata.js); the data keeps both apart.
const mtimeOf = (file) => { try { return statSync(file).mtimeMs; } catch { return 0; } };
let cache = null;   // { mtime, posts }
export function loadPosts() {
  const mtime = `${mtimeOf(FILE)}:${mtimeOf(MUSICBRAINZ)}`;
  if (cache?.mtime !== mtime) {
    const mb = mtimeOf(MUSICBRAINZ) ? JSON.parse(readFileSync(MUSICBRAINZ, "utf8")) : {};
    const posts = JSON.parse(readFileSync(FILE, "utf8")).posts;
    cache = { mtime, posts: posts.map((post) => withSlugs({ ...post, metadata: resolveMetadata(post, mb) })) };
  }
  return cache.posts;
}

// Groups posts by facet: [{ name, slug, posts }, ...]
export function groupBy(facet, posts = loadPosts()) {
  const groups = {};
  for (const post of posts) {
    const name = FACETS[facet](post);
    if (!has(name)) continue;
    (groups[name] ??= { name, slug: post.slugs[facet], posts: [] }).posts.push(post);
  }
  return Object.values(groups);
}
