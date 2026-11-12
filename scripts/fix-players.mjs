// Fixes the players flagged by audit-players.mjs, following the rule: each post's player is the recording
// that best matches what the post presents (data/post-context.json), or none if neither that version nor
// a clear alternative (same song, right performer) exists.
// Usage:
//   node scripts/fix-players.mjs --candidates   alternatives for each flagged player -> players-fix-candidates.json
//                                               (YouTube via yt-dlp search, Apple Music via the iTunes Search API;
//                                               Spotify has no keyless search, so only keep/remove there)
//   (decide)                                    players-fix-decisions.json: [{ id, player, action: "keep"|"replace"|"remove",
//                                               pick, reason }], by a human or an LLM reading the candidates file
//   node scripts/fix-players.mjs --apply        apply the decisions to posts.json (log: players-fix-log.md)
import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import { serializePosts } from "../lib/validate-post.js";
import { report as reportFile } from "../lib/reports.js";
import { effective, setPlayer } from "../lib/metadata.js";

const POSTS = new URL("../data/posts.json", import.meta.url);
const read = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null);
const data = JSON.parse(readFileSync(POSTS, "utf8"));
const byId = Object.fromEntries(data.posts.map((p) => [p.id, p]));
const context = read(new URL("../data/post-context.json", import.meta.url)) ?? {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FIELD = { YouTube: "youtube_code", Spotify: "spotify_url", "Apple Music": "apple_music_url" };

if (process.argv.includes("--candidates")) {
  const issues = read(reportFile("players-audit.json"));
  if (!issues) throw new Error("Run `npm run audit-players` first (players-audit.json)");
  const OUT = reportFile("players-fix-candidates.json");
  const out = read(OUT) ?? {};
  const run = promisify(execFile);
  // Words that steer the search to the version the post presents.
  const KEYWORD = { live: "live", acoustic: "acoustic", remix: "remix", orchestral: "orchestra", demo: "demo" };

  async function youtube(query) {
    try {
      const { stdout } = await run("yt-dlp", ["--flat-playlist", "--print", "%(id)s\t%(title)s\t%(channel)s\t%(duration)s", `ytsearch6:${query}`], { timeout: 60000 });
      return stdout.trim().split("\n").filter(Boolean).map((l) => { const [id, title, channel, duration] = l.split("\t"); return { id, title, channel, duration: Number(duration) || null }; });
    } catch { return []; }
  }
  async function itunes(term, entity) {
    await sleep(3000);
    try {
      const res = await fetch(`https://itunes.apple.com/search?country=ES&limit=8&entity=${entity}&term=${encodeURIComponent(term)}`, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) { await sleep(30000); return []; }
      return (await res.json()).results.map((r) => ({
        url: entity === "song" ? `https://embed.music.apple.com/es/album/${r.collectionId}?i=${r.trackId}` : `https://embed.music.apple.com/es/album/${r.collectionId}`,
        title: r.trackName ?? r.collectionName, artist: r.artistName, album: r.collectionName, seconds: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : null,
      }));
    } catch { return []; }
  }

  // One entry per flagged (post, player), with every reason it was flagged.
  const groups = {};
  for (const i of issues) (groups[`${i.id}|${i.player}`] ??= { id: i.id, player: i.player, current: i.info, flags: [] }).flags.push({ kind: i.kind, detail: i.detail });
  const todo = Object.entries(groups).filter(([k]) => !out[k]);
  console.log(`${todo.length} flagged players to find alternatives for`);
  let n = 0;
  for (const [key, g] of todo) {
    const post = byId[g.id], m = effective(post), c = context[g.id] ?? {};
    const performer = c.performer ?? m.artist ?? "", song = c.song ?? m.song ?? "", album = c.album ?? m.album ?? "";
    const kw = KEYWORD[c.version] ?? "";
    const album_post = c.subject === "album" || !song;
    let candidates = [];
    if (g.player === "YouTube") {
      const queries = [...new Set([`${performer} ${album_post ? album : song} ${kw}`.trim(), kw && `${performer} ${album_post ? album : song}`].filter(Boolean))];
      for (const q of queries) candidates.push(...await youtube(q));
      candidates = candidates.filter((v, i, all) => all.findIndex((o) => o.id === v.id) === i);
    } else if (g.player === "Apple Music") {
      candidates = await itunes(`${performer} ${album_post ? album : song} ${kw}`.trim(), album_post ? "album" : "song");
      if (kw && candidates.length < 3) candidates.push(...await itunes(`${performer} ${album_post ? album : song}`, album_post ? "album" : "song"));
      candidates = candidates.filter((v, i, all) => all.findIndex((o) => o.url === v.url) === i);
    }
    out[key] = { ...g, title: post.title, artist: m.artist ?? null, song: m.song ?? null, album: m.album ?? null, context: c, value: m[FIELD[g.player]] ?? null, candidates };
    if (++n % 10 === 0) { writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n"); console.log(`${n}/${todo.length}`); }
  }
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  console.log(`Done -> ${OUT}`);
  process.exit(0);
}

if (process.argv.includes("--apply")) {
  const decisions = read(reportFile("players-fix-decisions.json"));
  if (!decisions) throw new Error("No players-fix-decisions.json");
  const log = { replace: [], remove: [], keep: 0 };
  for (const d of decisions) {
    const post = byId[d.id], field = FIELD[d.player];
    if (!post || !field) throw new Error(`Bad decision ${JSON.stringify(d)}`);
    const before = effective(post)[field];
    if (d.action === "keep") { log.keep++; continue; }
    if (d.action === "remove") { setPlayer(post, field, null, { reason: d.reason === "broken" ? "broken" : "mismatch" }); log.remove.push(`| ${d.id} | ${d.player} | \`${before}\` | ${d.reason ?? ""} |`); continue; }
    if (d.action !== "replace" || !d.pick) throw new Error(`Bad decision ${JSON.stringify(d)}`);
    if (d.player === "Spotify") throw new Error(`No Spotify search: can't replace ${d.id}`);
    if (d.player === "YouTube" && !/^[\w-]{11}$/.test(d.pick)) throw new Error(`Bad YouTube id ${d.pick}`);
    // Apple Music players come only from MusicBrainz (an iTunes search by artist + title isn't reliable).
    if (d.player === "Apple Music") throw new Error(`No Apple Music search: can't replace ${d.id}`);
    setPlayer(post, field, d.pick);
    log.replace.push(`| ${d.id} | ${d.player} | \`${before ?? ""}\` → \`${d.pick}\` | ${d.reason ?? ""} |`);
  }
  writeFileSync(POSTS, serializePosts(data));
  const md = [`# Player fixes`, ``, `${log.replace.length} replaced, ${log.remove.length} removed, ${log.keep} kept.`, ``,
    `## Replaced`, ``, `| Post | Player | Change | Why |`, `|---|---|---|---|`, ...log.replace, ``,
    `## Removed`, ``, `| Post | Player | Was | Why |`, `|---|---|---|---|`, ...log.remove, ``].join("\n");
  writeFileSync(reportFile("players-fix-log.md"), md);
  console.log(`${log.replace.length} replaced, ${log.remove.length} removed, ${log.keep} kept -> players-fix-log.md`);
  process.exit(0);
}

console.log("Use --candidates or --apply (see the header of this file).");
