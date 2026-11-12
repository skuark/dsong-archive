// Shared helpers for the MusicBrainz scripts (scripts/match-musicbrainz*.mjs): name normalization,
// a rate-limited search client (MusicBrainz allows 1 request/s, no key) and data/musicbrainz.json I/O.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { serializePosts } from "./validate-post.js";
export { ALPHA2 } from "./countries.js";

export const FILE = new URL("../data/musicbrainz.json", import.meta.url);
const POSTS = new URL("../data/posts.json", import.meta.url);

// Accent, case, punctuation and leading "the" insensitive ("The strokes" = "Strokes").
export const norm = (s) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  .replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/^the /, "");

// Lucene phrase: only quotes and backslashes need escaping inside "…".
export const phrase = (s) => `"${s.replace(/[\\"]/g, "\\$&")}"`;

// Set MB_CONTACT (an email or URL) to send it in the User-Agent, as MusicBrainz asks.
const UA = `MetadataMatcher/0.1${process.env.MB_CONTACT ? ` ( ${process.env.MB_CONTACT} )` : ""}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
// Search: GET /ws/2/<entity>?query=…
export const search = (entity, query, limit = 5) => get(`${entity}?limit=${limit}&query=${encodeURIComponent(query)}`);

// GET /ws/2/<path> (search or lookup), retrying "busy" (503) and rate-limit (429) answers.
export async function get(path) {
  const url = `https://musicbrainz.org/ws/2/${path}${path.includes("?") ? "&" : "?"}fmt=json`;
  for (let attempt = 0; attempt < 6; attempt++) {
    await sleep(Math.max(0, last + 1100 - Date.now()));
    last = Date.now();
    try {
      const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(30000) });
      if (res.ok) return res.json();
      if (res.status !== 503 && res.status !== 429) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (attempt === 5) throw e;
    }
    await sleep(2000 * (attempt + 1));
  }
  return null;
}

// MusicBrainz data, as the scripts see it: { artists: { name: mbid }, artistInfo: { mbid: {…} }, preferEditor,
// posts: { id: { recording, release_group, … } } }. The artist part lives in data/musicbrainz.json; `posts` is
// each post's `musicbrainzMetadata` in data/posts.json (read from and written back there).
export const readData = () => {
  const file = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
  const posts = Object.fromEntries(JSON.parse(readFileSync(POSTS, "utf8")).posts.filter((p) => p.musicbrainzMetadata).map((p) => [p.id, p.musicbrainzMetadata]));
  return { artists: {}, ...file, posts };
};
export const writeData = ({ posts, ...rest }) => {
  writeFileSync(FILE, JSON.stringify(rest, null, 2) + "\n");
  if (!posts) return;
  const data = JSON.parse(readFileSync(POSTS, "utf8"));
  data.posts = data.posts.map((p) => withMusicbrainz(p, posts[p.id]));
  writeFileSync(POSTS, serializePosts(data));
};
// The post with `musicbrainzMetadata` set (after `editorMetadata` / `playersMetadata`) or removed.
export function withMusicbrainz(post, value) {
  const out = {};
  const after = "playersMetadata" in post ? "playersMetadata" : "editorMetadata";
  for (const [k, v] of Object.entries(post)) {
    if (k === "musicbrainzMetadata") continue;
    out[k] = v;
    if (k === after && value) out.musicbrainzMetadata = value;
  }
  return out;
}
export const readJson = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {});

// Post text without HTML, normalized, padded with spaces so " title " matches whole words only.
export const plain = (html = "") => ` ${norm(html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;|&#\d+;/g, " "))} `;
// Whether a title is named in the text (titles of 1–3 letters, like "O" or "War", are too ambiguous).
export const mentions = (text, title) => { const t = norm(title); return t.length > 3 && text.includes(` ${t} `); };

// Bigram similarity (0–1) of two normalized titles, tolerant of typos ("Devil & Dust" ~ "Devils & Dust").
export function similar(a, b) {
  const grams = (s) => { const g = []; for (let i = 0; i < s.length - 1; i++) g.push(s.slice(i, i + 2)); return g; };
  const x = grams(norm(a)), y = grams(norm(b));
  if (!x.length || !y.length) return norm(a) === norm(b) ? 1 : 0;
  let hits = 0; const pool = [...y];
  for (const g of x) { const i = pool.indexOf(g); if (i >= 0) { hits++; pool.splice(i, 1); } }
  return (2 * hits) / (x.length + y.length);
}

// A collaboration credited as one name in posts.json ("Enrique Morente y Lagartija Nick") is stored as its
// artists: [{ name, mbid }]; any other artist as a plain MBID string.
export const mbidsOf = (v) => (Array.isArray(v) ? v.map((p) => p.mbid) : v ? [v] : []);
// Lucene clause for the artist ids of a name: arid:X or arid:(X OR Y).
export const arid = (v) => { const ids = mbidsOf(v); return ids.length > 1 ? `(${ids.join(" OR ")})` : ids[0]; };
export const sameMbid = (a, b) => mbidsOf(a).join() === mbidsOf(b).join();
// Parts of a collaboration name; band names like "Nick Cave & The Bad Seeds" are not split.
const SEPARATOR = /\s+(?:y|e|&|and|feat\.?|ft\.?|con|with|vs\.?)\s+(?!(?:the|los|las|el|la)\b)|\s*\/\s*/i;
export const splitArtists = (name = "") => name.replace(/\s*\(.*?\)\s*/g, " ").trim().split(SEPARATOR).map((s) => s.trim()).filter(Boolean);
// dSong writes soundtracks as "BSO: Wall·e" / "OST Titanic": the title alone is what MusicBrainz knows.
export const bareTitle = (s) => s?.replace(/^\s*(?:b\.?s\.?o\.?|o\.?s\.?t\.?|banda sonora(?: original)?(?: de)?)(?:\s*[:\-–]\s*|\s+)/i, "").trim() || s;
// …and MusicBrainz as "American Beauty: Original Motion Picture Score": the film's title, without that tail.
export const filmTitle = (s) => s?.replace(/\s*(?:[:\-–]|\()\s*(?:the\s+)?(?:original\s+)?(?:motion picture|soundtrack|score|music from|banda sonora|ost\b|bso\b).*$/i, "").trim() || s;
