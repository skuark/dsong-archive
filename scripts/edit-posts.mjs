// Local editor for data/posts.json (text, metadata, players and comments) in the browser.
// Usage: npm run edit  ->  http://localhost:8082 (listens on 127.0.0.1 only)
// The "Fuentes" block (scripts/edit-sources.mjs) shows what the post says it presents and its MusicBrainz
// match, and searches MusicBrainz / YouTube / Apple Music without leaving the editor.
// Each save validates the post (same rules as `npm run validate`) and rewrites posts.json
// byte-identically; a post changed on disk since it was opened is not overwritten.
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import MarkdownIt from "markdown-it";
import { serializePosts, validatePost } from "../lib/validate-post.js";
import { withMusicbrainz } from "../lib/musicbrainz.js";
import { PLAYERS, effective } from "../lib/metadata.js";
import { chooseArtist, chooseRecord, details, searchSource, summaries } from "./edit-sources.mjs";

const PORT = Number(process.env.PORT) || 8082;
const FILE = new URL("../data/posts.json", import.meta.url);
const html = new URL("./edit-posts.html", import.meta.url);
const md = new MarkdownIt({ html: true });   // same as the site's `markdown` filter

const load = () => JSON.parse(readFileSync(FILE, "utf8"));
// musicbrainzMetadata is left out: MusicBrainz choices in the editor save it at once (edit-sources.mjs),
// so it changing on disk isn't a conflict, and a save keeps the one on disk.
const hash = ({ musicbrainzMetadata, ...post }) => createHash("sha1").update(JSON.stringify(post)).digest("hex");
const distinct = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));

function summary(post, extra = summaries([post])[post.id]) {
  const m = effective(post);
  return {
    ...extra,
    id: post.id, title: post.title, date: post.published_at.slice(0, 10), editor: post.editor.name,
    category: m.category, artist: m.artist ?? "",
    youtube: !!m.youtube_code, spotify: !!m.spotify_url, apple: !!m.apple_music_url, podcast: !!m.podcast_file,
    genre: !!m.genre, country: !!m.artist_nationality, song: !!m.song, comments: post.comments.length,
    reviewed: post.reviewed_at ?? "",
  };
}

// The editor shows (and edits) the players the post actually has: the editor's with the automatic changes
// (playersMetadata) on top. On save, a player left as shown keeps the data as it was; one changed by hand
// goes to editorMetadata and drops its automatic change (a human choice wins).
const forEditor = (post) => ({ ...post, editorMetadata: effective(post) });
function fromEditor(post, disk) {
  const shown = effective(disk), editorMetadata = { ...post.editorMetadata }, auto = { ...disk.playersMetadata };
  for (const field of PLAYERS) {
    if ((editorMetadata[field] ?? null) === (shown[field] ?? null)) {
      if (disk.editorMetadata[field] === undefined) delete editorMetadata[field]; else editorMetadata[field] = disk.editorMetadata[field];
    } else delete auto[field];
  }
  // Same key order as on disk (new fields at the end).
  const ordered = {};
  for (const k of Object.keys(disk.editorMetadata)) if (k in editorMetadata) ordered[k] = editorMetadata[k];
  Object.assign(ordered, editorMetadata);
  const out = {};
  for (const [k, v] of Object.entries({ ...post, editorMetadata: ordered })) {
    if (k === "playersMetadata") continue;
    out[k] = v;
    if (k === "editorMetadata" && Object.keys(auto).length) out.playersMetadata = auto;
  }
  return out;
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
      const extra = summaries(posts);
      return send(200, {
        posts: posts.map((p) => summary(p, extra[p.id])),
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
      return post ? send(200, { post: forEditor(post), hash: hash(post), sources: details(post) }) : send(404, { error: "No existe" });
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

    if (match && req.method === "POST") {
      const { post: edited, hash: original } = await body(req);
      const data = load();
      const i = data.posts.findIndex((p) => p.id === match[1]);
      if (i < 0) return send(404, { error: "No existe" });
      if (hash(data.posts[i]) !== original) return send(409, { error: "El artículo ha cambiado en disco desde que lo abriste. Recárgalo antes de guardar." });
      if (edited.id !== match[1]) return send(400, { errors: ["El id no se puede cambiar (las URLs dependen de él)"] });
      const post = fromEditor(clean(edited), data.posts[i]);
      const { errors, missing } = validatePost(post);
      if (errors.length) return send(400, { errors });
      data.posts[i] = withMusicbrainz(post, data.posts[i].musicbrainzMetadata);
      writeFileSync(FILE, serializePosts(data));
      return send(200, { post: forEditor(post), hash: hash(post), summary: summary(post), missing });
    }

    if (req.method === "POST" && url.pathname === "/api/preview") {
      const { content } = await body(req);
      return send(200, { html: md.render(content ?? "") });
    }

    send(404, { error: "Not found" });
  } catch (error) {
    send(500, { error: error.message });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`Editor at http://localhost:${PORT}`));
