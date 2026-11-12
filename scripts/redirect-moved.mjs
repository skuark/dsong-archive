// Old URLs must keep working (data/redirects.json is frozen, not computed): after a data change that moves
// facet pages (an album or artist renamed, an album or year that MusicBrainz corrects…), this finds the
// pages of a previous build that the current build no longer has, and redirects each one to the current page
// of the same kind that lists most of its posts. Pages of posts are never moved (ids don't change).
// Usage: cp -R _site /tmp/site-before; <change data>; npm run build; node scripts/redirect-moved.mjs /tmp/site-before; npm run build
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const before = process.argv[2];
if (!before || !existsSync(before)) throw new Error("Usage: node scripts/redirect-moved.mjs <previous _site directory>");
const FILE = new URL("../data/redirects.json", import.meta.url);
const redirects = JSON.parse(readFileSync(FILE, "utf8"));
const redirected = new Set(redirects.map((r) => r.from));
const FACETS = ["albums", "artists", "years", "categories", "countries", "editors"];
const postsIn = (file) => new Set([...readFileSync(file, "utf8").matchAll(/href="\/archive\/([a-z0-9-]+)\.html"/g)].map((m) => m[1]));

const added = [], lost = [];
for (const facet of FACETS) {
  const dir = join(before, "archive", facet);
  if (!existsSync(dir)) continue;
  const now = existsSync(join("_site/archive", facet)) ? readdirSync(join("_site/archive", facet)).filter((f) => f.endsWith(".html")) : [];
  // Real pages only: the redirect pages in _site (data/redirects.json) don't count as existing.
  const nowPosts = new Map(now.filter((f) => !redirected.has(`/archive/${facet}/${f}`)).map((f) => [f, postsIn(join("_site/archive", facet, f))]));
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".html"))) {
    const from = `/archive/${facet}/${f}`;
    if (nowPosts.has(f)) continue;
    // Already redirected: only fix it when its target is a facet page that no longer exists.
    const earlier = redirects.find((r) => r.from === from);
    if (earlier && !(earlier.to.startsWith(`/archive/${facet}/`) && !nowPosts.has(earlier.to.split("/").pop()))) continue;
    const old = postsIn(join(dir, f));
    let best = null, most = 0;
    for (const [g, posts] of nowPosts) { const n = [...old].filter((id) => posts.has(id)).length; if (n > most) { best = g; most = n; } }
    if (!best) { lost.push(from); continue; }
    if (earlier) earlier.to = `/archive/${facet}/${best}`;
    else redirects.push({ from, to: `/archive/${facet}/${best}` });
    added.push(`${from} -> ${best} (${most}/${old.size} posts)${earlier ? " (retargeted)" : ""}`);
  }
}
// Earlier redirects that now point to a moved page go straight to its new place (no chains).
const target = new Map(redirects.map((r) => [r.from, r.to]));
let shortened = 0;
for (const r of redirects) {
  const seen = new Set([r.from]);
  while (target.has(r.to) && !seen.has(r.to)) { seen.add(r.to); r.to = target.get(r.to); shortened++; }
}
writeFileSync(FILE, JSON.stringify(redirects, null, 2) + "\n");
if (shortened) console.log(`${shortened} earlier redirects now point to the new page`);
console.log(added.join("\n"));
console.log(`${added.length} redirects added or retargeted${lost.length ? `; no page lists the posts of: ${lost.join(", ")}` : ""}`);
