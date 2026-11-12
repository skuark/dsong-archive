// Finds YouTube candidates for posts without `youtube_code`, using yt-dlp search (no API key).
// Usage:
//   node scripts/find-youtube.mjs [report.json]          search (resumable: skips ids already in the report)
//   node scripts/find-youtube.mjs --limit=N [report.json] search only N posts (for testing)
//   node scripts/find-youtube.mjs --apply [report.json]  write picks with status "auto" or "ok" to posts.json
// Review the report by hand: set "status" to "ok" (accept), "no" (reject), or change "pick" to another id.
import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import { report as reportFile } from "../lib/reports.js";

const POSTS = new URL("../data/posts.json", import.meta.url);
const apply = process.argv.includes("--apply");
const report = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? reportFile("youtube-candidates.json");
const data = JSON.parse(readFileSync(POSTS, "utf8"));
// What each post says it presents (data/post-context.json): a live version, a cover by someone else…
const CONTEXT_FILE = new URL("../data/post-context.json", import.meta.url);
const context = existsSync(CONTEXT_FILE) ? JSON.parse(readFileSync(CONTEXT_FILE, "utf8")) : {};
const results = existsSync(report) ? JSON.parse(readFileSync(report, "utf8")) : {};
const save = () => writeFileSync(report, JSON.stringify(results, null, 2) + "\n");

if (apply) {
  // Decisions from review-youtube.mjs win over the report ({ pick: null } = rejected).
  const decisions = existsSync(reportFile("youtube-review.json")) ? JSON.parse(readFileSync(reportFile("youtube-review.json"), "utf8")) : {};
  let applied = 0;
  for (const post of data.posts) {
    const r = results[post.id], d = decisions[post.id];
    const pick = d ? d.pick : r?.pick && ["auto", "ok"].includes(r.status) ? r.pick : null;
    if (!pick || post.editorMetadata.youtube_code) continue;
    post.editorMetadata.youtube_code = pick;
    applied++;
  }
  // Same serialization as the original file (see AGENTS.md).
  const json = JSON.stringify(data, null, 2).replace(/[\u007f-\u009f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
  writeFileSync(POSTS, json + "\n");
  console.log(`${applied} youtube_code added`);
  process.exit(0);
}

const run = promisify(execFile);
const CONCURRENCY = 3;
const NOISE = /\b(cover|karaoke|live|en vivo|en directo|directo|lyrics?|letra|remix|reaction|tutorial|instrumental|8d|slowed|sped up|nightcore|originally performed|made popular|in the style of|tribute|experience|ao vivo)\b/;
const norm = (s = "") => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Share of the song's words present in the title (tolerates typos in the data like "Immmortels").
function overlap(t, s) {
  const words = new Set(t.split(" "));
  const tokens = s.split(" ").filter(Boolean);
  return tokens.filter((w) => words.has(w)).length / (tokens.length || 1);
}

const LIVE = /^(live|en vivo|en directo|directo)$/;

function score({ title, channel }, artist, song, { allowLive = false } = {}) {
  const t = norm(title), c = norm(channel), a = norm(artist), s = norm(song);
  let points = 0;
  if (t.includes(s)) points += 2;
  else if (overlap(t, s) >= 0.6) points += 1;
  if (t.includes(a) || c.includes(a)) points += 2;
  // Official channel: Topic, VEVO, or named after the artist ("091 (Oficial)", "Sex Pistols Official").
  if (c.endsWith(" topic") || c.includes("vevo") || c.startsWith(a)) points += 2;
  if (/\b(official|oficial)\b/.test(t)) points += 1;
  const noise = t.match(NOISE)?.[0];
  if (noise && !s.includes(noise) && !(allowLive && LIVE.test(noise))) points -= 3;
  if (!allowLive && / @ |\b(session|sessions|concert|concierto|festival|glastonbury|woodstock|tour)\b/i.test(title) && !/session|concert/i.test(song)) points -= 3;
  return points;
}

async function search(query, count = 5) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { stdout } = await run("yt-dlp", ["--flat-playlist", "--print", "%(id)s\t%(title)s\t%(channel)s\t%(duration)s", `ytsearch${count}:${query}`], { timeout: 60000 });
      return stdout.trim().split("\n").filter(Boolean).map((line) => {
        const [id, title, channel, duration] = line.split("\t");
        return { id, title, channel, duration: Number(duration) || null };
      });
    } catch {
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
    }
  }
  return null;
}

// --deep: last automatic pass for undecided "review" entries, with looser artist matching
// ("The Editors" vs "EDITORS", "X feat. Y", typos fixed by iTunes, soundtracks whose "artist" is the film)
// and several queries (artist + song, song + album, soundtrack). With a known duration (Spotify/iTunes)
// a ±4 s match plus a similar title is enough; otherwise the usual score >= 5 with any artist variant.
// New candidates are added to the entry either way, so manual review gets better options.
if (process.argv.includes("--deep")) {
  const decisions = existsSync(reportFile("youtube-review.json")) ? JSON.parse(readFileSync(reportFile("youtube-review.json"), "utf8")) : {};
  const byId = Object.fromEntries(data.posts.map((p) => [p.id, p]));
  const pending = Object.keys(results).filter((id) => results[id].status === "review" && !decisions[id] && byId[id]);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const known = (s) => { const m = s?.match(/^(.*) \((\d+) s\)$/); return m && { name: m[1].replace(/\s+originally by.*$/i, ""), seconds: +m[2] }; };
  const variants = (artist) => {
    const main = artist.split(/\s+(?:feat\.?|ft\.?|featuring|&|y|and|con|vs\.?)\s+|,|\//i)[0];
    return [...new Set([artist, main, artist.replace(/^the\s+/i, ""), main.replace(/^the\s+/i, "")].map(norm).filter((v) => v.length > 1))];
  };

  async function itunes(term, { song, album }) {
    for (const country of ["ES", "US"]) {
      await sleep(3000);
      try {
        const res = await fetch(`https://itunes.apple.com/search?entity=song&limit=15&country=${country}&term=${encodeURIComponent(term)}`, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) { await sleep(30000); continue; }
        const t = ((await res.json()).results ?? []).find((t) => overlap(norm(t.trackName), norm(song)) >= 0.6 && (!album || overlap(norm(t.collectionName), norm(album)) >= 0.5));
        if (t) return { name: t.trackName.replace(/\s*[([].*$/, ""), seconds: Math.round(t.trackTimeMillis / 1000), artist: t.artistName };
      } catch { await sleep(5000); }
    }
    return null;
  }

  let accepted = 0, done = 0;
  for (const id of pending) {
    const r = results[id], m = byId[id].editorMetadata;
    const { artist, song, album = "" } = m;
    const soundtrack = m.category === "Bandas Sonoras Originales" || /^(varios|desconocido)$/i.test(artist);
    let track = known(r.spotify) ?? known(r.itunes);
    if (!track || soundtrack) track = (await itunes(`${song} ${album}`, { song, album })) ?? track;
    const artists = [...variants(artist), ...(track?.artist ? variants(track.artist) : [])];
    const name = track?.name ?? song;
    const queries = [...new Set([
      `${track?.artist ?? artist} ${name}`,
      album && `${name} ${album}`,
      soundtrack && `${name} ${album || artist} soundtrack`,
    ].filter(Boolean))];
    const videos = [];
    for (const q of queries) videos.push(...((await search(q, 8)) ?? []));

    const scored = videos.filter((v, i) => videos.findIndex((o) => o.id === v.id) === i).map((v) => {
      const t = norm(v.title), c = norm(v.channel);
      const best = Math.max(...artists.map((a) => score(v, a, name)), score(v, artist, song));
      // The artist (any variant) must appear in title or channel; the album only counts when it isn't the song
      // name itself (S.M.V - "Thunder" from "Thunder" matched an NBA recap).
      const albumOk = album && norm(album) !== norm(song) && overlap(t, norm(album)) >= 0.6;
      const artistOk = artists.some((a) => t.includes(a) || c.includes(a)) || (soundtrack && albumOk);
      const noise = t.match(NOISE)?.[0];
      const clean = !(noise && !norm(name).includes(noise));
      const titleOk = overlap(t, norm(name)) >= 0.6 || overlap(t, norm(song)) >= 0.6;
      const durationOk = track && v.duration && Math.abs(v.duration - track.seconds) <= 4;
      return { ...v, score: best, ok: clean && titleOk && (durationOk ? artistOk : best >= 5) };
    }).sort((x, y) => y.ok - x.ok || y.score - x.score);

    const match = scored.find((v) => v.ok);
    if (match) {
      Object.assign(r, { pick: match.id, status: "auto", reason: "deep" });
      r.candidates.unshift(`${match.id} [deep] ${match.title} · ${match.channel}`);
      accepted++;
    } else {
      // Not resolved: offer the best new candidates for manual review.
      const have = new Set(r.candidates.map((c) => c.split(" ")[0]));
      r.candidates.push(...scored.filter((v) => !have.has(v.id)).slice(0, 3).map((v) => `${v.id} [${v.score}] ${v.title} · ${v.channel}`));
    }
    if (track && !r.itunes && !r.spotify) r.itunes = `${track.name} (${track.seconds} s)`;
    if (++done % 10 === 0) { save(); console.log(`${done}/${pending.length}, ${accepted} accepted`); }
  }
  save();
  console.log(`Deep done: ${accepted} accepted`);
  process.exit(0);
}

// --clues: for undecided "review" entries, use what the post itself says:
//   1. a YouTube link in the article text (the author's own choice), if the video still exists;
//   2. the exact title + duration of the post's Spotify track (embed page, no API key), ±5 s;
//   3. if the article talks about a live performance, rescore without penalizing live videos.
if (process.argv.includes("--clues")) {
  const decisions = existsSync(reportFile("youtube-review.json")) ? JSON.parse(readFileSync(reportFile("youtube-review.json"), "utf8")) : {};
  const byId = Object.fromEntries(data.posts.map((p) => [p.id, p]));
  const pending = Object.keys(results).filter((id) => results[id].status === "review" && !decisions[id] && byId[id]);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const UA = { "user-agent": "Mozilla/5.0" };
  const accept = (id, v, reason) => {
    Object.assign(results[id], { pick: v.id, status: "auto", reason });
    results[id].candidates.unshift(`${v.id} [${reason}] ${v.title} · ${v.channel}`);
    count[reason]++;
  };
  const count = { content: 0, spotify: 0, live: 0 };

  async function oembed(videoId) {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      return res.ok ? await res.json() : null;
    } catch { return null; }
  }

  async function spotifyTrack(embedUrl) {
    try {
      const res = await fetch(embedUrl, { headers: UA, signal: AbortSignal.timeout(15000) });
      const html = await res.text();
      const duration = Number(html.match(/"duration":(\d+)/)?.[1]);
      const title = html.match(/"title":"([^"]+)"/)?.[1];
      return duration && title ? { name: JSON.parse(`"${title}"`).replace(/\s*[([].*$/, "").replace(/\s+-\s+.*$/, ""), seconds: Math.round(duration / 1000) } : null;
    } catch { return null; }
  }

  let done = 0;
  for (const id of pending) {
    const post = byId[id];
    const { artist, song, spotify_url: spotify } = post.editorMetadata;
    // The post's context says whether it presents a live version; without it, any mention in the text.
    const liveMention = context[id] ? context[id].version === "live" : /en directo|concierto|en vivo|\blive\b/i.test(post.content);

    // 1. YouTube link in the article.
    const linked = [...post.content.matchAll(/(?:youtube\.com\/(?:watch\?(?:[^"'\s]*&)?v=|embed\/|v\/)|youtu\.be\/)([\w-]{11})/g)].map((m) => m[1]);
    let found = false;
    for (const videoId of new Set(linked)) {
      const info = await oembed(videoId);
      if (info) { accept(id, { id: videoId, title: info.title, channel: info.author_name }, "content"); found = true; break; }
    }

    // 2. Spotify track title + duration.
    if (!found && /\/track\//.test(spotify ?? "")) {
      const track = await spotifyTrack(spotify);
      await sleep(500);
      if (track) {
        results[id].spotify = `${track.name} (${track.seconds} s)`;
        const s = norm(track.name);
        const videos = [...((await search(`${artist} ${track.name}`, 8)) ?? []), ...((await search(`${artist} ${track.name} topic`, 5)) ?? [])];
        const match = videos
          .filter((v) => v.duration && Math.abs(v.duration - track.seconds) <= 5)
          .map((v) => ({ ...v, score: score(v, artist, track.name, { allowLive: liveMention }) }))
          .filter((v) => norm(v.title).includes(s) && v.score >= 4)
          .sort((x, y) => y.score - x.score)[0];
        if (match) { accept(id, match, "spotify"); found = true; }
      }
    }

    // 3. Live performance mentioned: rescore stored candidates allowing live videos.
    if (!found && liveMention) {
      const best = results[id].candidates.map((line) => {
        const m = line.match(/^(\S+) \[[^\]]+\] (.*) · (.*)$/);
        return m && { id: m[1], title: m[2], channel: m[3] };
      }).filter(Boolean).map((v) => ({ ...v, score: score(v, artist, song, { allowLive: true }) })).sort((x, y) => y.score - x.score)[0];
      if (best?.score >= 5) accept(id, best, "live");
    }

    if (++done % 10 === 0) { save(); console.log(`${done}/${pending.length}`, count); }
  }
  save();
  console.log("Clues done:", count);
  process.exit(0);
}

// --itunes: for undecided "review" entries, get the canonical song name and duration from the iTunes
// Search API, search YouTube again with that name, and accept a video whose title matches and whose
// duration is within ±5 s of the studio track (rules out live versions, covers and edits).
if (process.argv.includes("--itunes")) {
  const decisions = existsSync(reportFile("youtube-review.json")) ? JSON.parse(readFileSync(reportFile("youtube-review.json"), "utf8")) : {};
  const byId = Object.fromEntries(data.posts.map((p) => [p.id, p]));
  const pending = Object.keys(results).filter((id) => results[id].status === "review" && !decisions[id] && byId[id]);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // iTunes allows ~20 requests/minute: one every 3 s, with backoff on 403/429.
  async function itunes(artist, song) {
    const a = norm(artist), s = norm(song);
    for (const country of ["ES", "US"]) {
      for (let attempt = 0; attempt < 4; attempt++) {
        await sleep(3000);
        try {
          const url = `https://itunes.apple.com/search?entity=song&limit=10&country=${country}&term=${encodeURIComponent(`${artist} ${song}`)}`;
          const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
          if (res.status === 403 || res.status === 429) { await sleep(30000 * (attempt + 1)); continue; }
          const tracks = (await res.json()).results ?? [];
          const track = tracks.find((t) => {
            const ta = norm(t.artistName), tn = norm(t.trackName.replace(/\s*[([].*$/, ""));
            return (ta.includes(a) || a.includes(ta)) && (overlap(tn, s) >= 0.6 || overlap(s, tn) >= 0.6);
          });
          if (track) return { name: track.trackName.replace(/\s*[([].*$/, ""), seconds: Math.round(track.trackTimeMillis / 1000) };
          break;
        } catch { await sleep(5000); }
      }
    }
    return null;
  }

  let accepted = 0, done = 0;
  for (const id of pending) {
    const { artist } = byId[id].editorMetadata;
    const track = await itunes(artist, byId[id].editorMetadata.song);
    if (track) {
      const s = norm(track.name);
      const found = [...((await search(`${artist} ${track.name}`, 8)) ?? []), ...((await search(`${artist} ${track.name} topic`, 5)) ?? [])];
      const matches = found
        .filter((v) => v.duration && Math.abs(v.duration - track.seconds) <= 5)
        .map((v) => ({ ...v, score: score(v, artist, track.name) }))
        .filter((v) => norm(v.title).includes(s) && v.score >= 4)
        .sort((x, y) => y.score - x.score);
      results[id].itunes = `${track.name} (${track.seconds} s)`;
      if (matches[0]) {
        const m = matches[0];
        Object.assign(results[id], { pick: m.id, status: "auto", reason: "itunes" });
        results[id].candidates.unshift(`${m.id} [itunes] ${m.title} · ${m.channel}`);
        accepted++;
      }
    }
    if (++done % 10 === 0) { save(); console.log(`${done}/${pending.length}, ${accepted} accepted`); }
  }
  save();
  console.log(`iTunes done: ${accepted} accepted (title + duration match)`);
  process.exit(0);
}

// --rescore: recompute scores of stored candidates for undecided "review" entries (no new searches).
if (process.argv.includes("--rescore")) {
  const decisions = existsSync(reportFile("youtube-review.json")) ? JSON.parse(readFileSync(reportFile("youtube-review.json"), "utf8")) : {};
  const byId = Object.fromEntries(data.posts.map((p) => [p.id, p]));
  let promoted = 0;
  for (const [id, r] of Object.entries(results)) {
    if (r.status !== "review" || decisions[id] || !byId[id]) continue;
    const { artist, song } = byId[id].editorMetadata;
    const cands = r.candidates.map((line) => {
      const m = line.match(/^(\S+) \[[^\]]+\] (.*) · (.*)$/);
      return m && { id: m[1], title: m[2], channel: m[3] };
    }).filter(Boolean).map((v) => ({ ...v, score: score(v, artist, song) })).sort((x, y) => y.score - x.score);
    r.candidates = cands.map((v) => `${v.id} [${v.score}] ${v.title} · ${v.channel}`);
    r.pick = cands[0]?.id ?? null;
    if (cands[0]?.score >= 5) { r.status = "auto"; r.reason = "rescore"; promoted++; }
  }
  save();
  console.log(`Rescore done: ${promoted} promoted to auto`);
  process.exit(0);
}

// --refine: for "review" entries not yet decided by hand, look for an official art track
// (a "<Artist> - Topic" channel: official audio over the cover) and accept it if title and artist match.
if (process.argv.includes("--refine")) {
  const decisions = existsSync(reportFile("youtube-review.json")) ? JSON.parse(readFileSync(reportFile("youtube-review.json"), "utf8")) : {};
  const byId = Object.fromEntries(data.posts.map((p) => [p.id, p]));
  const pending = Object.keys(results).filter((id) => results[id].status === "review" && !decisions[id] && byId[id]);
  let accepted = 0, done = 0;
  const worker = async () => {
    while (pending.length) {
      const id = pending.shift();
      const { artist, song } = byId[id].editorMetadata;
      const a = norm(artist), s = norm(song);
      const found = (await search(`${artist} ${song} topic`)) ?? [];
      const match = found.find((v) => {
        const c = norm(v.channel), t = norm(v.title);
        if (!c.endsWith(" topic")) return false;
        const ch = c.slice(0, -6);
        const noise = t.match(NOISE)?.[0];
        return (ch.includes(a) || a.includes(ch)) && t.startsWith(s) && !(noise && !s.includes(noise));
      });
      if (match) {
        Object.assign(results[id], { pick: match.id, status: "auto", reason: "topic" });
        results[id].candidates.unshift(`${match.id} [topic] ${match.title} · ${match.channel}`);
        accepted++;
      }
      if (++done % 20 === 0) { save(); console.log(`${done} refined, ${accepted} accepted`); }
      await new Promise((r) => setTimeout(r, 500));
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));
  save();
  console.log(`Refine done: ${accepted} accepted as official art track (Topic)`);
  process.exit(0);
}

const queue = data.posts.filter((p) => !p.editorMetadata.youtube_code && p.editorMetadata.artist && p.editorMetadata.song && !results[p.id]);
const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice(8));
if (limit) queue.splice(limit);
const total = queue.length;
let done = 0;

async function worker() {
  while (queue.length) {
    const post = queue.shift();
    const { artist, song } = post.editorMetadata;
    const found = await search(`${artist} ${song}`);
    if (found) {
      const candidates = found.map((v) => ({ ...v, score: score(v, artist, song) })).sort((a, b) => b.score - a.score);
      const best = candidates[0];
      results[post.id] = {
        query: `${artist} - ${song}`,
        pick: best?.id ?? null,
        status: !best ? "none" : best.score >= 5 ? "auto" : "review",
        candidates: candidates.slice(0, 3).map((v) => `${v.id} [${v.score}] ${v.title} · ${v.channel}`),
      };
    }
    if (++done % 20 === 0) { save(); console.log(`${done}/${total}`); }
    await new Promise((r) => setTimeout(r, 500));
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
save();
const count = (s) => Object.values(results).filter((r) => r.status === s).length;
console.log(`Done. auto: ${count("auto")}, review: ${count("review")}, none: ${count("none")} -> ${report}`);
