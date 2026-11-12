// Local editor for data/posts.json (text, metadata, players and comments) in the browser.
// Usage: npm run edit  ->  http://localhost:8082 (listens on 127.0.0.1 only)
// The "Fuentes" block (scripts/edit-sources.mjs) shows what the post says it presents and its MusicBrainz
// match, and searches MusicBrainz / YouTube / Apple Music without leaving the editor.
// Each save validates the post (same rules as `npm run validate`) and rewrites posts.json
// byte-identically; a post changed on disk since it was opened is not overwritten.
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import MarkdownIt from "markdown-it";
import { serializePosts, validatePost } from "../lib/validate-post.js";
import { PLAYERS, effective, hidePlayer, musicbrainzValues, ordered, playerSources, resolveMetadata, sameAsMusicbrainz } from "../lib/metadata.js";
import { countryOf } from "../lib/countries.js";
import { chooseArtist, chooseRecord, details, searchSource, summaries } from "./edit-sources.mjs";

const PORT = Number(process.env.PORT) || 8082;
const FILE = new URL("../data/posts.json", import.meta.url);
const MB_FILE = new URL("../data/musicbrainz.json", import.meta.url);
const REDIRECTS = new URL("../data/redirects.json", import.meta.url);
const CONTEXT = new URL("../data/post-context.json", import.meta.url);
const loadRedirects = () => JSON.parse(readFileSync(REDIRECTS, "utf8"));
const postUrl = (id) => `/archive/${id}.html`;
const incoming = (id, redirects = loadRedirects()) => redirects.filter((r) => r.to === postUrl(id)).map((r) => r.from);

// Changing a post's id (its slug: /archive/<id>.html). Old URLs must keep working: the old URL redirects to the
// new one, redirects to the old one go straight to the new one (no chains), and a redirect from the new URL
// (renaming back) is dropped. Files keyed by post id follow: data/post-context.json and the JSON reports
// (top-level or `posts` keys), so the post keeps its context and review decisions.
function slugProblem(from, to, posts, redirects) {
  if (!/^[a-z0-9-]+$/.test(to)) return "El slug solo puede tener a-z, 0-9 y guiones";
  if (posts.some((p) => p.id === to)) return `Ya hay un artículo con el slug ${to}`;
  const taken = redirects.find((r) => r.from === postUrl(to));
  if (taken && taken.to !== postUrl(from)) return `${postUrl(to)} ya redirige a ${taken.to}`;
  return null;
}
function renameId(from, to) {
  const redirects = loadRedirects().filter((r) => r.from !== postUrl(to));
  for (const r of redirects) if (r.to === postUrl(from)) r.to = postUrl(to);
  redirects.push({ from: postUrl(from), to: postUrl(to) });
  writeFileSync(REDIRECTS, JSON.stringify(redirects, null, 2) + "\n");
  const rekey = (obj) => {
    if (!obj || typeof obj !== "object" || Array.isArray(obj) || !(from in obj)) return false;
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k === from ? to : k] = v;
    for (const k of Object.keys(obj)) delete obj[k];
    Object.assign(obj, out);
    return true;
  };
  const mb = JSON.parse(readFileSync(MB_FILE, "utf8"));
  let mbChanged = false;
  for (const ids of Object.values(mb.preferEditor ?? {})) for (let i = 0; i < ids.length; i++) if (ids[i] === from) { ids[i] = to; mbChanged = true; }
  if (mbChanged) writeFileSync(MB_FILE, JSON.stringify(mb, null, 2) + "\n");
  const files = [CONTEXT, ...(existsSync("reports") ? readdirSync("reports").filter((f) => f.endsWith(".json")).map((f) => `reports/${f}`) : [])];
  for (const file of files) {
    if (!existsSync(file)) continue;
    const json = JSON.parse(readFileSync(file, "utf8"));
    if (rekey(json) | rekey(json.posts)) writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
  }
}
const html = new URL("./edit-posts.html", import.meta.url);
const md = new MarkdownIt({ html: true });   // same as the site's `markdown` filter

const load = () => JSON.parse(readFileSync(FILE, "utf8"));
// The automatic layers are left out: MusicBrainz choices and hiding players save them at once, so their
// changing on disk isn't a conflict, and a save keeps the ones on disk.
const hash = (post) => createHash("sha1").update(JSON.stringify(Object.fromEntries(Object.entries(post).filter(([k]) => !LAYERS.includes(k))))).digest("hex");
const distinct = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));

function summary(post, extra = summaries([post])[post.id], mb = mbFile()) {
  const m = effective(post);
  const differs = Object.entries(site(post, mb)).some(([f, i]) => (i.value || "") !== (post.editorMetadata[f] || "") || i.hidden?.length);
  return {
    ...extra,
    id: post.id, title: post.title, date: post.published_at.slice(0, 10), editor: post.editor.name,
    category: m.category, artist: m.artist ?? "",
    youtube: !!m.youtube_code, spotify: !!m.spotify_url, apple: !!m.apple_music_url, podcast: !!m.podcast_file,
    differs, genre: !!m.genre, country: !!m.artist_nationality, song: !!m.song, comments: post.comments.length,
  };
}

// The form edits editorMetadata only (the original data plus hand corrections); the automatic layers
// (hiddenPlayers, musicbrainzMetadata, spotifyMetadata, ytdlpMetadata) are kept from disk on save. `site`
// tells what the site shows for each field and where it comes from, to compare with the editor's values.
const LAYERS = ["hiddenPlayers", "musicbrainzMetadata", "spotifyMetadata", "ytdlpMetadata"];
const SOURCE = { editorMetadata: "editor", musicbrainzMetadata: "MusicBrainz", spotifyMetadata: "Spotify", ytdlpMetadata: "yt-dlp" };
const COMPARED = ["song", "artist", "album", "year", "genre", "artist_nationality", "artist_url"];
const mbFile = () => { try { return JSON.parse(readFileSync(MB_FILE, "utf8")); } catch { return {}; } };
function site(post, mb = mbFile()) {
  const resolved = resolveMetadata(post, mb), ed = post.editorMetadata, out = {}, said = musicbrainzValues(post, mb);
  for (const f of COMPARED) out[f] = { value: resolved[f] ?? "", source: (resolved[f] ?? "") === (ed[f] ?? "") ? "editor" : "MusicBrainz" };
  const shown = playerSources(post);
  for (const f of PLAYERS) {
    out[f] = { value: shown[f]?.value ?? "", source: shown[f] ? SOURCE[shown[f].source] : "",
      hidden: Object.entries(post.hiddenPlayers?.[f] ?? {}).map(([value, reason]) => ({ value, reason })) };
  }
  // MusicBrainz's own value, and whether it's the editor's.
  for (const [f, info] of Object.entries(out)) {
    if (said[f]) Object.assign(info, { musicbrainz: said[f], match: sameAsMusicbrainz(f, ed[f], said[f], { countryOf }) });
  }
  return out;
}
function withLayers(post, disk) {
  const out = { ...post };
  for (const l of LAYERS) { delete out[l]; if (disk[l]) out[l] = structuredClone(disk[l]); }
  // A player typed by hand that was hidden: shown again (a human choice wins).
  for (const f of PLAYERS) {
    const v = out.editorMetadata[f];
    if (v && v !== disk.editorMetadata[f] && out.hiddenPlayers?.[f]?.[v]) {
      delete out.hiddenPlayers[f][v];
      if (!Object.keys(out.hiddenPlayers[f]).length) delete out.hiddenPlayers[f];
      if (!Object.keys(out.hiddenPlayers).length) delete out.hiddenPlayers;
    }
  }
  return ordered(out);
}

// Field values: trimmed; empty metadata fields are removed (the data has no empty keys)
function clean(post) {
  const metadata = {};
  for (const [key, value] of Object.entries(post.editorMetadata ?? {})) {
    const v = typeof value === "string" ? value.trim() : value;
    if (v !== "" && v != null) metadata[key] = v;
  }
  return { ...post, title: post.title.trim(), published_at: post.published_at.trim(), editorMetadata: metadata };
}

async function body(req) {
  let text = "";
  for await (const chunk of req) text += chunk;
  return JSON.parse(text);
}

createServer(async (req, res) => {
  const send = (code, value, type = "application/json") => {
    res.writeHead(code, { "content-type": type });
    res.end(type === "application/json" ? JSON.stringify(value) : value);
  };
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.pathname === "/") return send(200, readFileSync(html), "text/html; charset=utf-8");

    if (req.method === "GET" && url.pathname === "/api/posts") {
      const { posts } = load();
      const editors = [...new Map(posts.map((p) => [p.editor.name, p.editor])).values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
      const extra = summaries(posts), mb = mbFile();
      return send(200, {
        posts: posts.map((p) => summary(p, extra[p.id], mb)),
        options: {
          categories: distinct(posts.map((p) => p.editorMetadata.category)),
          genres: distinct(posts.map((p) => p.editorMetadata.genre)),
          countries: distinct(posts.map((p) => p.editorMetadata.artist_nationality)),
          editors,
        },
      });
    }

    const match = url.pathname.match(/^\/api\/posts\/([a-z0-9-]+)$/);
    if (match && req.method === "GET") {
      const post = load().posts.find((p) => p.id === match[1]);
      return post ? send(200, { post, hash: hash(post), site: site(post), redirects: incoming(post.id), sources: details(post) }) : send(404, { error: "No existe" });
    }

    // Context, MusicBrainz match and player audit of a post (refreshed after a choice)
    const sources = url.pathname.match(/^\/api\/sources\/([a-z0-9-]+)$/);
    if (sources && req.method === "GET") {
      const post = load().posts.find((p) => p.id === sources[1]);
      return post ? send(200, { sources: details(post), summary: summary(post) }) : send(404, { error: "No existe" });
    }
    // Live searches: mb-artist, mb-recording, mb-release-group, youtube, apple
    const searchMatch = url.pathname.match(/^\/api\/search\/([a-z-]+)$/);
    if (searchMatch && req.method === "GET") return send(200, { results: await searchSource(searchMatch[1], url.searchParams) });
    // MusicBrainz choices: saved at once to musicbrainzMetadata / data/musicbrainz.json and the review decisions
    if (req.method === "POST" && url.pathname === "/api/musicbrainz/artist") {
      const { name, value } = await body(req);
      chooseArtist(load().posts, name, value);
      return send(200, {});
    }
    if (req.method === "POST" && url.pathname === "/api/musicbrainz/record") {
      const { id, candidate } = await body(req);
      return send(200, { value: await chooseRecord(id, candidate) });
    }

    // Hide a player the site shows (reason "hand"), or show again a hidden one: saved at once.
    const playerMatch = url.pathname.match(/^\/api\/players\/([a-z0-9-]+)$/);
    if (playerMatch && req.method === "POST") {
      const { field, value, action } = await body(req);
      const data = load();
      const post = data.posts.find((p) => p.id === playerMatch[1]);
      if (!post || !PLAYERS.includes(field) || !value) return send(400, { error: "Petición no válida" });
      if (action === "hide") hidePlayer(post, field, value, "hand");
      else {
        const hidden = post.hiddenPlayers?.[field];
        if (hidden) { delete hidden[value]; if (!Object.keys(hidden).length) delete post.hiddenPlayers[field]; }
        if (post.hiddenPlayers && !Object.keys(post.hiddenPlayers).length) delete post.hiddenPlayers;
      }
      const { errors } = validatePost(post);
      if (errors.length) return send(400, { errors });
      data.posts[data.posts.indexOf(post)] = ordered(post);
      writeFileSync(FILE, serializePosts(data));
      return send(200, { site: site(post), summary: summary(post) });
    }

    if (match && req.method === "POST") {
      const { post: edited, hash: original } = await body(req);
      const data = load();
      const i = data.posts.findIndex((p) => p.id === match[1]);
      if (i < 0) return send(404, { error: "No existe" });
      if (hash(data.posts[i]) !== original) return send(409, { error: "El artículo ha cambiado en disco desde que lo abriste. Recárgalo antes de guardar." });
      const renamed = edited.id !== match[1];
      if (renamed) { const problem = slugProblem(match[1], edited.id, data.posts, loadRedirects()); if (problem) return send(400, { errors: [problem] }); }
      const post = withLayers(clean(edited), data.posts[i]);
      const { errors, missing } = validatePost(post);
      if (errors.length) return send(400, { errors });
      data.posts[i] = post;
      writeFileSync(FILE, serializePosts(data));
      if (renamed) renameId(match[1], post.id);
      return send(200, { post, hash: hash(post), site: site(post), redirects: incoming(post.id), summary: summary(post), missing, renamedFrom: renamed ? match[1] : undefined });
    }

    // All the redirects (data/redirects.json), for the list in the editor.
    if (req.method === "GET" && url.pathname === "/api/redirects") return send(200, { redirects: loadRedirects() });

    if (req.method === "POST" && url.pathname === "/api/preview") {
      const { content } = await body(req);
      return send(200, { html: md.render(content ?? "") });
    }

    send(404, { error: "Not found" });
  } catch (error) {
    send(500, { error: error.message });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`Editor at http://localhost:${PORT}`));
