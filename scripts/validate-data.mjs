// Validates data/posts.json. Exits non-zero on errors; warnings are informative.
import data from "../data/posts.json" with { type: "json" };

const DATE_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}$/;
const errors = [];
const warnings = {};
const warn = (field) => (warnings[field] = (warnings[field] ?? 0) + 1);
const seen = new Set();

for (const [i, post] of data.posts.entries()) {
  const where = post.id ?? `#${i}`;
  if (!post.id) errors.push(`${where}: missing id`);
  else if (!/^[a-z0-9-]+$/.test(post.id)) errors.push(`${where}: id must be lowercase ASCII (a-z, 0-9, -)`);
  else if (seen.has(post.id)) errors.push(`${where}: duplicate id`);
  seen.add(post.id);

  if (!post.title) errors.push(`${where}: missing title`);
  if (!DATE_RE.test(post.published_at ?? "")) errors.push(`${where}: bad published_at "${post.published_at}"`);
  if (!post.editor?.name) errors.push(`${where}: missing editor.name`);
  if (!post.metadata?.category) errors.push(`${where}: missing metadata.category`);

  const spotify = post.metadata?.spotify_url;
  if (spotify && !/^https:\/\/open\.spotify\.com\/embed\//.test(spotify)) errors.push(`${where}: spotify_url must be an embed URL (https://open.spotify.com/embed/...)`);

  for (const field of ["artist", "album", "year", "song"]) {
    if (!post.metadata?.[field]) warn(`metadata.${field}`);
  }
  for (const comment of post.comments ?? []) {
    if (!DATE_RE.test(comment.published_at ?? "")) errors.push(`${where}: bad comment date "${comment.published_at}"`);
  }
}

console.log(`${data.posts.length} posts checked`);
for (const [field, count] of Object.entries(warnings)) console.log(`warning: ${count} posts without ${field}`);
for (const error of errors) console.error(`error: ${error}`);
process.exit(errors.length ? 1 : 0);
