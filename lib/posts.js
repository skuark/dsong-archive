import slugifyLib from "@sindresorhus/slugify";
import data from "../data/posts.json" with { type: "json" };

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
};

// Each post gets `slugs.<facet>` (only when it has a value) for linking.
export const posts = data.posts.map((post) => {
  const slugs = {};
  for (const [facet, name] of Object.entries(FACETS)) {
    const value = name(post);
    if (has(value)) slugs[facet] = slugify(value);
  }
  return { ...post, slugs };
});

// Groups posts by facet: [{ name, slug, posts }, ...]
export function groupBy(facet) {
  const groups = {};
  for (const post of posts) {
    const name = FACETS[facet](post);
    if (!has(name)) continue;
    (groups[name] ??= { name, slug: post.slugs[facet], posts: [] }).posts.push(post);
  }
  return Object.values(groups);
}
