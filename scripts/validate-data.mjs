// Validates data/posts.json. Exits non-zero on errors; warnings are informative.
import data from "../data/posts.json" with { type: "json" };
import { validatePost } from "../lib/validate-post.js";

const errors = [];
const warnings = {};
const seen = new Set();

for (const [i, post] of data.posts.entries()) {
  const where = post.id ?? `#${i}`;
  if (post.id && seen.has(post.id)) errors.push(`${where}: duplicate id`);
  seen.add(post.id);

  const result = validatePost(post);
  for (const error of result.errors) errors.push(`${where}: ${error}`);
  for (const field of result.missing) warnings[`metadata.${field}`] = (warnings[`metadata.${field}`] ?? 0) + 1;
}

console.log(`${data.posts.length} posts checked`);
for (const [field, count] of Object.entries(warnings)) console.log(`warning: ${count} posts without ${field}`);
for (const error of errors) console.error(`error: ${error}`);
process.exit(errors.length ? 1 : 0);
