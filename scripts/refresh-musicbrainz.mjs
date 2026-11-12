// Refreshes what MusicBrainz says about the artists and posts already matched, without matching again
// (phases 1 and 2 and their review decisions stay as they are):
//   1. the artists' records (country, genres, official site, name, aliases): musicbrainz-artists --refresh
//   2. the players MusicBrainz links to each recording/album: musicbrainz-players, --check, --apply
//      (the previous cache is kept as reports/musicbrainz-urls.prev.json)
//   3. reports/musicbrainz-diffs.md, redirects for pages that moved (redirect-moved), validate, check-links
// Usage: npm run refresh-musicbrainz   (~1 h, 1 req/s; review `git diff data/` before committing)
import { spawnSync } from "node:child_process";
import { existsSync, renameSync, rmSync } from "node:fs";
import { report } from "../lib/reports.js";

const run = (cmd, ...args) => {
  console.log(`\n$ ${[cmd, ...args].join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) { console.error(`Failed: ${cmd} ${args.join(" ")}`); process.exit(r.status ?? 1); }
};
const build = (dir) => { rmSync(dir, { recursive: true, force: true }); run("npx", "@11ty/eleventy", "--quiet", `--output=${dir}`); };

// The site as it is now, to redirect the pages a data change moves.
const before = report("site-before-refresh");
build(before);

run("node", "scripts/musicbrainz-artists.mjs", "--refresh");

const urls = report("musicbrainz-urls.json");
if (existsSync(urls)) renameSync(urls, report("musicbrainz-urls.prev.json"));
run("node", "scripts/musicbrainz-players.mjs");
run("node", "scripts/musicbrainz-players.mjs", "--check");
run("node", "scripts/musicbrainz-players.mjs", "--apply");

run("node", "scripts/musicbrainz-diffs.mjs");
build("_site");
run("node", "scripts/redirect-moved.mjs", before);
build("_site");
rmSync(before, { recursive: true, force: true });
run("node", "scripts/validate-data.mjs");
run("node", "scripts/check-links.mjs");
console.log("\nDone. Review `git diff data/` and reports/musicbrainz-diffs.md before committing.");
