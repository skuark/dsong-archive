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
