// Renames artists in posts.json (typos, a film title used as artist, two artists under one name) and keeps
// everything that hangs off the name consistent (lib/rename-artists.js): the MusicBrainz link and redirects
// from the old artist and album pages when they disappear.
// Usage: node scripts/rename-artists.mjs renames.json
//   renames.json: [{ "from": "Eric Jonhson", "to": "Eric Johnson", "mbid"?: "<id>" | [{ name, mbid }], "posts"?: ["<id>", …] }]
//   "posts" limits the rename to those posts (splitting one name into two artists); "mbid" sets the link of
//   the new name (default: the old name's link, unless the new name already has one).
import { readFileSync, writeFileSync } from "node:fs";
import { serializePosts } from "../lib/validate-post.js";
import { readData, readJson, writeData } from "../lib/musicbrainz.js";
import { renameArtists } from "../lib/rename-artists.js";
import { report as reportFile } from "../lib/reports.js";

const POSTS = new URL("../data/posts.json", import.meta.url);
const REDIRECTS = new URL("../data/redirects.json", import.meta.url);
const renames = JSON.parse(readFileSync(process.argv[2], "utf8"));
const data = JSON.parse(readFileSync(POSTS, "utf8"));
const redirects = JSON.parse(readFileSync(REDIRECTS, "utf8"));
const mb = readData();
const decisions = readJson(reportFile("musicbrainz-review.json"));
const changed = renameArtists(renames, { data, mb, decisions, redirects });
writeFileSync(POSTS, serializePosts(data));
writeFileSync(REDIRECTS, JSON.stringify(redirects, null, 2) + "\n");
writeData(mb);
writeFileSync(reportFile("musicbrainz-review.json"), JSON.stringify(decisions, null, 2) + "\n");
console.log(changed.join("\n"));
