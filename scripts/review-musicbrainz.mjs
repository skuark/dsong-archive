// Local UI to review the MusicBrainz artist matches found by match-musicbrainz.mjs.
// Usage: node scripts/review-musicbrainz.mjs [report.json]  ->  http://localhost:8083
// Decisions go to musicbrainz-review.json ({ mbid } or { mbid: null } = no match) and win on --apply.
import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const PORT = 8083;
const report = process.argv[2] ?? "musicbrainz-candidates.json";
const DECISIONS = "musicbrainz-review.json";
const html = new URL("./review-musicbrainz.html", import.meta.url);
const read = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {});
const decisions = read(DECISIONS);

createServer(async (req, res) => {
  const send = (code, type, body) => { res.writeHead(code, { "content-type": type }); res.end(body); };
  if (req.method === "GET" && req.url === "/") return send(200, "text/html; charset=utf-8", readFileSync(html));
  // Re-read on every request, so new results show up while the search is still running.
  if (req.method === "GET" && req.url === "/api/data") return send(200, "application/json", JSON.stringify({ results: read(report), decisions }));
  if (req.method === "POST" && req.url === "/api/decide") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const { key, mbid } = JSON.parse(body);
    if (mbid === undefined) delete decisions[key];
    else decisions[key] = { mbid };
    writeFileSync(DECISIONS, JSON.stringify(decisions, null, 2) + "\n");
    return send(200, "application/json", "{}");
  }
  send(404, "text/plain", "Not found");
}).listen(PORT, "127.0.0.1", () => console.log(`Review at http://localhost:${PORT}`));
