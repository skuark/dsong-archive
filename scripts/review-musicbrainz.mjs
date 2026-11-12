// Local UI to review the MusicBrainz matches: artists (match-musicbrainz.mjs) and songs/albums
// (match-musicbrainz-posts.mjs). Usage: node scripts/review-musicbrainz.mjs  ->  http://localhost:8083
// Decisions go to musicbrainz-review.json ({ mbid } or { mbid: null } = no match) and
// musicbrainz-posts-review.json ({ pick } or { pick: null }); they win on each script's --apply.
import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const PORT = 8083;
const FILES = {
  artists: { report: "musicbrainz-candidates.json", decisions: "musicbrainz-review.json", field: "mbid" },
  posts: { report: "musicbrainz-posts-candidates.json", decisions: "musicbrainz-posts-review.json", field: "pick" },
};
const html = new URL("./review-musicbrainz.html", import.meta.url);
const read = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {});
const decisions = { artists: read(FILES.artists.decisions), posts: read(FILES.posts.decisions) };

createServer(async (req, res) => {
  const send = (code, type, body) => { res.writeHead(code, { "content-type": type }); res.end(body); };
  const path = new URL(req.url, "http://localhost").pathname;   // "/?kind=posts" -> "/"
  if (req.method === "GET" && path === "/") return send(200, "text/html; charset=utf-8", readFileSync(html));
  // Re-read on every request, so new results show up while the search is still running.
  if (req.method === "GET" && path === "/api/data") return send(200, "application/json", JSON.stringify({
    artists: { results: read(FILES.artists.report), decisions: decisions.artists },
    posts: { results: read(FILES.posts.report), decisions: decisions.posts },
  }));
  if (req.method === "POST" && path === "/api/decide") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const { kind, key, value, candidate } = JSON.parse(body);
    const f = FILES[kind], d = decisions[kind];
    if (!f) return send(400, "text/plain", "Bad kind");
    if (value === undefined) delete d[key];
    // A pasted recording/album for a post travels with its decision (it's not among the candidates).
    else d[key] = { [f.field]: value, ...(kind === "posts" && candidate?.manual ? { candidate } : {}) };
    writeFileSync(f.decisions, JSON.stringify(d, null, 2) + "\n");
    return send(200, "application/json", "{}");
  }
  send(404, "text/plain", "Not found");
}).listen(PORT, "127.0.0.1", () => console.log(`Review at http://localhost:${PORT}`));
