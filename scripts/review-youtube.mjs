// Local UI to review YouTube candidates found by find-youtube.mjs.
// Usage: node scripts/review-youtube.mjs [report.json]  ->  http://localhost:8081
// Decisions go to youtube-review.json (not the report, which find-youtube rewrites while it runs).
import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { report as reportFile } from "../lib/reports.js";
import { effective } from "../lib/metadata.js";

const PORT = 8081;
const report = process.argv[2] ?? reportFile("youtube-candidates.json");
const DECISIONS = reportFile("youtube-review.json");
const html = new URL("./review-youtube.html", import.meta.url);
const read = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {});
const decisions = read(DECISIONS);
// Reference players for each post (same sources as post.njk), to compare against the candidates.
const PODCAST = "https://dsongstatic.jesusmagamu.dev/mp3/podcast/";
const posts = JSON.parse(readFileSync(new URL("../data/posts.json", import.meta.url), "utf8")).posts;
const players = Object.fromEntries(posts.map((p) => [p.id, p]).map(([id, p, m = effective(p)]) => [id, [
  m.spotify_url && { label: "Spotify", type: "iframe", src: m.spotify_url, height: 80 },
  m.apple_music_url && { label: "Apple Music", type: "iframe", src: m.apple_music_url, height: m.apple_music_url.includes("?i=") ? 175 : 450 },
  m.podcast_file && { label: "Podcast", type: "audio", src: PODCAST + m.podcast_file },
].filter(Boolean)]));

createServer(async (req, res) => {
  const send = (code, type, body) => { res.writeHead(code, { "content-type": type }); res.end(body); };
  if (req.method === "GET" && req.url === "/") return send(200, "text/html; charset=utf-8", readFileSync(html));
  // The report is re-read on every request, so new results show up while the search is still running.
  if (req.method === "GET" && req.url === "/api/data") return send(200, "application/json", JSON.stringify({ results: read(report), decisions, players }));
  if (req.method === "POST" && req.url === "/api/decide") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const { id, pick } = JSON.parse(body);
    if (pick === undefined) delete decisions[id];
    else decisions[id] = { pick };
    writeFileSync(DECISIONS, JSON.stringify(decisions, null, 2) + "\n");
    return send(200, "application/json", "{}");
  }
  send(404, "text/plain", "Not found");
}).listen(PORT, "127.0.0.1", () => console.log(`Review at http://localhost:${PORT}`));
