// Shared helpers for the MusicBrainz scripts (scripts/match-musicbrainz*.mjs): name normalization,
// a rate-limited search client (MusicBrainz allows 1 request/s, no key) and data/musicbrainz.json I/O.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const FILE = new URL("../data/musicbrainz.json", import.meta.url);

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

// data/musicbrainz.json: { artists: { name: mbid }, posts: { id: { recording, release_group, … } } }.
export const readData = () => ({ artists: {}, posts: {}, ...(existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {}) });
export const writeData = (data) => writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n");
export const readJson = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {});

// Post text without HTML, normalized, padded with spaces so " title " matches whole words only.
export const plain = (html = "") => ` ${norm(html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;|&#\d+;/g, " "))} `;
// Whether a title is named in the text (titles of 1–3 letters, like "O" or "War", are too ambiguous).
export const mentions = (text, title) => { const t = norm(title); return t.length > 3 && text.includes(` ${t} `); };

// ISO 3166-1 numeric (lib/countries.js) -> alpha-2 (MusicBrainz `country`).
export const ALPHA2 = {
  "032": "AR", "036": "AU", "040": "AT", "056": "BE", "076": "BR", "104": "MM", "124": "CA", "132": "CV", "152": "CL",
  "156": "CN", "170": "CO", "192": "CU", "208": "DK", "214": "DO", "234": "FO", "246": "FI", "250": "FR", "276": "DE",
  "292": "GI", "300": "GR", "352": "IS", "360": "ID", "372": "IE", "376": "IL", "380": "IT", "388": "JM", "392": "JP",
  "410": "KR", "422": "LB", "466": "ML", "484": "MX", "504": "MA", "508": "MZ", "528": "NL", "554": "NZ", "578": "NO",
  "600": "PY", "616": "PL", "620": "PT", "630": "PR", "642": "RO", "643": "RU", "710": "ZA", "724": "ES", "752": "SE",
  "780": "TT", "788": "TN", "792": "TR", "804": "UA", "826": "GB", "840": "US", "858": "UY",
};

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
