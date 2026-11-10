import data from "../data/posts.json" with { type: "json" };

export const posts = data.posts;

// Groups posts by key: [[key, posts], ...]
export function groupBy(keyFn) {
  const groups = {};
  for (const post of posts) {
    (groups[keyFn(post)] ??= []).push(post);
  }
  return Object.entries(groups);
}
