// Short bio and photo of each linked artist, for the artist pages: from the artist's Wikidata link in MusicBrainz
// (reports/musicbrainz-artists.json, from musicbrainz-artists.mjs) to its Wikipedia article (Spanish, or else English:
// the first paragraph of the intro) and its Wikidata image (P18, always a free Commons file, with author and license
// for the credit). Writes data/artist-bios.json: MBID -> { bio, lang, wikipedia, image? }. No key; batched requests
// (~5 min, 1 req/s). Usage: node scripts/artist-bios.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { mbidsOf, readData } from "../lib/musicbrainz.js";
import { report } from "../lib/reports.js";

const OUT = "data/artist-bios.json";
const HEADERS = { "User-Agent": "dsong-archive/1.0 (https://dsong.es)", Accept: "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, options = {}) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch(url, { ...options, headers: { ...HEADERS, ...options.headers } });
    if (res.ok) { await sleep(1000); return res.json(); }
    if (res.status !== 429 && res.status < 500) throw new Error(`${res.status} ${url}`);
    const wait = Number(res.headers.get("retry-after")) || 15 * (attempt + 1);
    console.log(`${res.status}: waiting ${wait} s`);
    await sleep(wait * 1000);
  }
  throw new Error(`Gave up: ${url}`);
}
const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

const info = JSON.parse(readFileSync(report("musicbrainz-artists.json"), "utf8"));
const linked = new Set(Object.values(readData().artists).flatMap(mbidsOf));
const byQ = new Map();   // Wikidata Q id -> [MBID…]
for (const id of linked) {
  const q = /\/(Q\d+)$/.exec(info[id]?.urls?.wikidata ?? "")?.[1];
  if (q) byQ.set(q, [...(byQ.get(q) ?? []), id]);
}
console.log(`${byQ.size} artists with Wikidata`);

// 1. Wikidata: Spanish/English article titles and image, by SPARQL (200 entities per query)
const wd = new Map();   // Q -> { es?, en?, image? }
for (const part of chunks([...byQ.keys()], 200)) {
  const query = `SELECT ?item ?image ?es ?en WHERE { VALUES ?item { ${part.map((q) => `wd:${q}`).join(" ")} }
    OPTIONAL { ?item wdt:P18 ?image }
    OPTIONAL { ?esA schema:about ?item; schema:isPartOf <https://es.wikipedia.org/>; schema:name ?es }
    OPTIONAL { ?enA schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?en } }`;
  const data = await fetchJson("https://query.wikidata.org/sparql", {
    method: "POST", body: new URLSearchParams({ query, format: "json" }),
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/sparql-results+json" },
  });
  for (const row of data.results.bindings) {
    const q = row.item.value.split("/").pop(), entry = wd.get(q) ?? {};
    entry.es ??= row.es?.value; entry.en ??= row.en?.value;
    entry.image ??= row.image && decodeURIComponent(row.image.value.split("/Special:FilePath/").pop()).replaceAll("_", " ");
    wd.set(q, entry);
  }
  console.log(`Wikidata: ${wd.size}/${byQ.size}`);
}

// 2. Wikipedia: first paragraph of each article's intro, plain text (20 titles per request: the extracts limit)
const HATNOTE = /puede referirse|may refer to|no debe confundirse|not to be confused|otros usos|other uses|redirige aquí|redirects here/i;
const intro = (text) => {
  const paragraph = (text ?? "").split("\n").map((p) => p.trim()).find((p) => p.length > 40 && !HATNOTE.test(p)) ?? "";
  if (paragraph.length <= 600) return paragraph;
  const cut = paragraph.slice(0, 600), end = cut.lastIndexOf(". ");
  return end > 200 ? cut.slice(0, end + 1) : cut.replace(/\s+\S*$/, "") + "…";
};
async function extracts(lang, titles) {
  const found = new Map();
  for (const part of chunks(titles, 20)) {
    const params = new URLSearchParams({ action: "query", format: "json", formatversion: "2", prop: "extracts", exintro: "1",
      explaintext: "1", exlimit: "20", redirects: "1", titles: part.join("|") });
    const data = await fetchJson(`https://${lang}.wikipedia.org/w/api.php?${params}`);
    const back = new Map(part.map((t) => [t, t]));
    for (const { from, to } of [...(data.query.normalized ?? []), ...(data.query.redirects ?? [])]) back.set(to, back.get(from) ?? from);
    for (const page of data.query.pages ?? []) {
      const bio = intro(page.extract);
      if (bio) found.set(back.get(page.title) ?? page.title, { bio, title: page.title });
    }
  }
  console.log(`Wikipedia ${lang}: ${found.size}/${titles.length}`);
  return found;
}
const entries = [...wd.values()];
const es = await extracts("es", entries.map((e) => e.es).filter(Boolean));
const en = await extracts("en", entries.filter((e) => !(e.es && es.has(e.es)) && e.en).map((e) => e.en));

// 3. Commons: a 320 px thumbnail of each image, its page, author and license (50 files per request)
const plain = (html) => (html ?? "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, " ").trim();
const images = new Map();
for (const part of chunks([...new Set(entries.map((e) => e.image).filter(Boolean))], 50)) {
  const params = new URLSearchParams({ action: "query", format: "json", formatversion: "2", prop: "imageinfo", iiprop: "url|extmetadata",
    iiurlwidth: "320", iiextmetadatafilter: "Artist|LicenseShortName", titles: part.map((f) => `File:${f}`).join("|") });
  const data = await fetchJson(`https://commons.wikimedia.org/w/api.php?${params}`);
  const back = new Map(part.map((f) => [`File:${f}`, f]));
  for (const { from, to } of data.query.normalized ?? []) back.set(to, back.get(from) ?? from);
  for (const page of data.query.pages ?? []) {
    const ii = page.imageinfo?.[0];
    if (!ii?.thumburl) continue;
    images.set(back.get(page.title) ?? page.title.replace(/^File:/, ""), {
      src: ii.thumburl.replace(/\?.*$/, ""), width: ii.thumbwidth, height: ii.thumbheight, page: ii.descriptionurl,
      author: plain(ii.extmetadata?.Artist?.value).replace(/https?:\/\/\S+/g, "").trim() || undefined, license: plain(ii.extmetadata?.LicenseShortName?.value) || undefined,
    });
  }
}
console.log(`Commons: ${images.size} images`);

const bios = {};
for (const [q, ids] of byQ) {
  const e = wd.get(q);
  if (!e) continue;
  const [lang, hit] = e.es && es.has(e.es) ? ["es", es.get(e.es)] : e.en && en.has(e.en) ? ["en", en.get(e.en)] : [];
  const image = e.image && images.get(e.image);
  if (!hit && !image) continue;
  const entry = Object.fromEntries(Object.entries({
    bio: hit?.bio, lang, wikipedia: hit && `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(hit.title.replaceAll(" ", "_"))}`, image,
  }).filter(([, v]) => v));
  for (const id of ids) bios[id] = entry;
}
const sorted = Object.fromEntries(Object.keys(bios).sort().map((id) => [id, bios[id]]));
writeFileSync(OUT, JSON.stringify(sorted, null, 2) + "\n");
const all = Object.values(sorted);
console.log(`Done: ${all.length} artists in ${OUT} (${all.filter((b) => b.bio).length} bios, ${all.filter((b) => b.image).length} photos)`);
