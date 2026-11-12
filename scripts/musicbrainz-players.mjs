// Players from MusicBrainz: the YouTube, Spotify and Apple Music links that MusicBrainz editors attached to the
// recording a post was matched to (song posts), or to a release of its album (album posts: no song). They're for
// that exact recording, unlike a search by artist + title. Links can be dead, so each one is checked (YouTube and
// Spotify oEmbed, iTunes lookup; no keys) before it's used.
// Usage:
//   node scripts/musicbrainz-players.mjs            fetch the links (1 req/s, resumable) into reports/musicbrainz-urls.json
//   node scripts/musicbrainz-players.mjs --check    check each link once (cached in the same file)
//   node scripts/musicbrainz-players.mjs --apply    write the working ones to musicbrainzMetadata (youtube_code, spotify_url, apple_music_url)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { get, readData, writeData } from "../lib/musicbrainz.js";
import { report as reportFile } from "../lib/reports.js";

const OUT = reportFile("musicbrainz-urls.json");
const cache = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { posts: {}, checks: {} };
const save = () => writeFileSync(OUT, JSON.stringify(cache, null, 2) + "\n");
const posts = JSON.parse(readFileSync(new URL("../data/posts.json", import.meta.url), "utf8")).posts;
const data = readData();

// Link -> { field, value } in the form the site uses, or null.
function player(url) {
  let m = /(?:youtube\.com\/watch\?(?:.*&)?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/.exec(url);
  if (m) return { field: "youtube_code", value: m[1] };
  m = /open\.spotify\.com\/(track|album)\/([A-Za-z0-9]{22})/.exec(url);
  if (m) return { field: "spotify_url", value: `https://open.spotify.com/embed/${m[1]}/${m[2]}` };
  m = /music\.apple\.com\/[a-z]{2}\/album\/(?:[^/?]+\/)?(\d+)(?:\?i=(\d+))?/.exec(url);
  if (m) return { field: "apple_music_url", value: `https://embed.music.apple.com/es/album/${m[1]}${m[2] ? `?i=${m[2]}` : ""}` };
  m = /music\.apple\.com\/[a-z]{2}\/song\/(?:[^/?]+\/)?(\d+)/.exec(url);
  if (m) return { field: "apple_music_url", value: `https://embed.music.apple.com/es/song/${m[1]}` };
  return null;
}
// What a post is matched to: its recording (song posts) or its album (posts without a song).
const target = (p) => {
  const mb = p.musicbrainzMetadata;
  if (!mb) return null;
  if (p.editorMetadata.song && mb.recording) return `recording:${mb.recording}`;
  if (!p.editorMetadata.song && mb.release_group) return `release-group:${mb.release_group}`;
  return null;
};

async function links(key) {
  const [kind, id] = key.split(":");
  const rels = kind === "recording"
    ? (await get(`recording/${id}?inc=url-rels`))?.relations ?? []
    : ((await get(`release?release-group=${id}&inc=url-rels&limit=100`))?.releases ?? []).flatMap((r) => r.relations ?? []);
  return [...new Set(rels.filter((r) => !r.ended).map((r) => r.url?.resource).filter(Boolean))];
}

async function check({ field, value }) {
  try {
    if (field === "youtube_code") return (await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${value}`)}`)).ok;
    if (field === "spotify_url") return (await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(value.replace("/embed/", "/"))}`)).ok;
    const id = /\?i=(\d+)/.exec(value)?.[1] ?? /\/(\d+)$/.exec(value)?.[1] ?? /album\/(\d+)/.exec(value)[1];
    return ((await (await fetch(`https://itunes.apple.com/lookup?id=${id}&country=es`)).json()).resultCount ?? 0) > 0;
  } catch { return null; }   // network error: unknown, checked again next time
}

const picks = (p) => {
  const c = cache.posts[p.id];
  if (!c || c.key !== target(p)) return {};
  const out = {};
  for (const url of c.links) { const pl = player(url); if (pl && !(pl.field in out) && cache.checks[pl.value] !== false) out[pl.field] = pl.value; }
  return out;
};

if (process.argv.includes("--check")) {
  const todo = [...new Set(posts.flatMap((p) => Object.entries(picks(p)).map(([field, value]) => JSON.stringify({ field, value }))))]
    .map((s) => JSON.parse(s)).filter((pl) => typeof cache.checks[pl.value] !== "boolean");
  console.log(`${todo.length} links to check`);
  let n = 0;
  for (const pl of todo) {
    cache.checks[pl.value] = await check(pl);
    await new Promise((r) => setTimeout(r, 300));
    if (++n % 25 === 0) { save(); console.log(`${n}/${todo.length}`); }
  }
  // Apple Music song links (/song/<id>) -> the usual embed of the song inside its album (/album/<id>?i=<song>).
  cache.appleAlbums ??= {};
  const songs = Object.keys(cache.checks).filter((v) => cache.checks[v] === true && /\/song\/\d+$/.test(v) && !(v in cache.appleAlbums));
  if (songs.length) console.log(`${songs.length} Apple Music songs to place in their album`);
  for (const v of songs) {
    const id = /\/song\/(\d+)$/.exec(v)[1];
    try { cache.appleAlbums[v] = (await (await fetch(`https://itunes.apple.com/lookup?id=${id}&country=es`)).json()).results?.[0]?.collectionId ?? null; } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  save();
  const values = Object.values(cache.checks);
  console.log(`Checked: ${values.filter((v) => v === true).length} work, ${values.filter((v) => v === false).length} dead, ${values.filter((v) => v === null).length} unknown`);
} else if (process.argv.includes("--apply")) {
  const counts = {};
  for (const p of posts) {
    const rec = data.posts[p.id];
    if (!rec) continue;
    for (const field of ["youtube_code", "spotify_url", "apple_music_url"]) delete rec[field];
    for (const [field, value] of Object.entries(picks(p))) {
      if (cache.checks[value] !== true) continue;
      const album = cache.appleAlbums?.[value];
      rec[field] = album ? `https://embed.music.apple.com/es/album/${album}?i=${/\/song\/(\d+)$/.exec(value)[1]}` : value;
      counts[field] = (counts[field] ?? 0) + 1;
    }
  }
  writeData(data);
  console.log("Players from MusicBrainz -> musicbrainzMetadata:", counts);
} else {
  const todo = posts.filter((p) => target(p) && cache.posts[p.id]?.key !== target(p));
  console.log(`${todo.length} posts to fetch`);
  let n = 0;
  for (const p of todo) {
    const key = target(p);
    cache.posts[p.id] = { key, links: (await links(key)).filter((u) => player(u)) };
    if (++n % 25 === 0) { save(); console.log(`${n}/${todo.length}`); }
  }
  save();
  const found = Object.values(cache.posts).filter((c) => c.links.length).length;
  console.log(`Done: ${found} of ${Object.keys(cache.posts).length} posts have player links`);
}
