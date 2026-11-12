// Fetches the MusicBrainz record of every linked artist (data/musicbrainz.json): canonical name and aliases,
// country/area, type, community genres and links (official site, Wikidata…), into musicbrainz-artists.json
// (a cache, not committed). musicbrainz-diffs.mjs compares it with posts.json. No key; 1 req/s (~25 min).
// Usage: node scripts/musicbrainz-artists.mjs [--refresh]   (resumable: skips artists already fetched)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { get, mbidsOf, readData } from "../lib/musicbrainz.js";
import { report as reportFile } from "../lib/reports.js";

const OUT = reportFile("musicbrainz-artists.json");
const info = existsSync(OUT) && !process.argv.includes("--refresh") ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const save = () => writeFileSync(OUT, JSON.stringify(info, null, 2) + "\n");
const ids = [...new Set(Object.values(readData().artists).flatMap(mbidsOf))].filter((id) => !info[id]);
console.log(`${ids.length} artists to fetch`);

let n = 0;
for (const id of ids) {
  const a = await get(`artist/${id}?inc=url-rels+genres+aliases`);
  if (!a) continue;
  const urls = {};
  for (const rel of a.relations ?? []) {
    const url = rel.url?.resource;
    if (!url || rel.ended) continue;
    const kind = rel.type === "official homepage" ? "official" : /wikidata/.test(url) ? "wikidata" : /wikipedia/.test(url) ? "wikipedia"
      : /bandcamp/.test(url) ? "bandcamp" : /discogs/.test(url) ? "discogs" : /last\.fm/.test(url) ? "lastfm" : null;
    if (kind && !urls[kind]) urls[kind] = url;
  }
  info[id] = {
    name: a.name, sort: a["sort-name"] ?? null, type: a.type ?? null, country: a.country ?? null, area: a.area?.name ?? null,
    disambiguation: a.disambiguation || null,
    aliases: [...new Set((a.aliases ?? []).map((x) => x.name))],
    genres: (a.genres ?? []).sort((x, y) => y.count - x.count).slice(0, 5).map((g) => g.name),
    urls,
  };
  if (++n % 25 === 0) { save(); console.log(`${n}/${ids.length}`); }
}
save();
console.log(`Done: ${Object.keys(info).length} artists in ${OUT}`);
