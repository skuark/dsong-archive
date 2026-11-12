// Sources for the editor (edit-posts.mjs): what the post says it presents (data/post-context.json), its
// MusicBrainz match (data/musicbrainz.json + the candidates of match-musicbrainz*.mjs), the player audit,
// and live searches (MusicBrainz, YouTube via yt-dlp, Apple Music via iTunes Search) to pick from.
// MusicBrainz choices are saved at once: to data/musicbrainz.json and to the review decisions, so the
// scripts' --apply keeps them. Players are only filled into the form (saved with the post).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFileSync } from "node:fs";
import { get, norm, phrase, readData, readJson, search, writeData } from "../lib/musicbrainz.js";
import { report as reportFile } from "../lib/reports.js";

const FILES = {
  artists: reportFile("musicbrainz-candidates.json"), artistDecisions: reportFile("musicbrainz-review.json"),
  posts: reportFile("musicbrainz-posts-candidates.json"), postDecisions: reportFile("musicbrainz-posts-review.json"),
  groups: reportFile("musicbrainz-release-groups.json"), audit: reportFile("players-audit.json"),
};
const CONTEXT = new URL("../data/post-context.json", import.meta.url);
const run = promisify(execFile);
// Re-read on each call: the match scripts may be running and writing these files.
const load = () => ({
  mb: readData(), artists: readJson(FILES.artists), artistDecisions: readJson(FILES.artistDecisions),
  posts: readJson(FILES.posts), postDecisions: readJson(FILES.postDecisions), context: readJson(CONTEXT), audit: readJson(FILES.audit),
});
const write = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + "\n");

// Status of the artist and of the post's recording/album: ok (linked), review (candidates to check),
// none (not searched yet), notfound (searched: not in MusicBrainz), nomatch (decided by hand: not in MusicBrainz),
// noartist (the artist isn't linked yet).
function status(post, s) {
  const m = post.editorMetadata, key = norm(m.artist);
  const artist = !m.artist ? null : key in s.artistDecisions ? (s.artistDecisions[key].mbid ? "ok" : "nomatch")
    : s.mb.artists[m.artist] ? "ok" : s.artists[key]?.status === "review" ? "review" : s.artists[key]?.status === "notfound" ? "notfound" : "none";
  const record = !(m.song || m.album) || !m.artist ? null : post.id in s.postDecisions ? (s.postDecisions[post.id].pick ? "ok" : "nomatch")
    : s.mb.posts[post.id] ? "ok" : !s.mb.artists[m.artist] ? "noartist" : s.posts[post.id]?.status === "review" ? "review" : s.posts[post.id]?.status === "notfound" ? "notfound" : "none";
  return { artist, record };
}

// Fields the editor's list filters on, for every post.
export function summaries(posts) {
  const s = load();
  const flagged = new Set(Array.isArray(s.audit) ? s.audit.map((i) => i.id) : []);
  return Object.fromEntries(posts.map((post) => {
    const c = s.context[post.id] ?? {};
    return [post.id, { mb: status(post, s), conflict: !!c.metadata_conflict, version: c.version && c.version !== "original" ? c.version : "", flagged: flagged.has(post.id) }];
  }));
}

// Everything the editor shows for one post.
export function details(post) {
  const s = load(), m = post.editorMetadata, key = norm(m.artist);
  const r = s.artists[key], p = s.posts[post.id];
  return {
    context: s.context[post.id] ?? null,
    status: status(post, s),
    artist: m.artist ? {
      name: m.artist, key, value: s.mb.artists[m.artist] ?? null, decided: key in s.artistDecisions,
      candidates: r?.candidates ?? [], via: r?.via ?? null,
    } : null,
    record: {
      value: s.mb.posts[post.id] ?? null, decided: post.id in s.postDecisions,
      pick: s.postDecisions[post.id]?.pick ?? (p?.status === "auto" ? p.pick : null), candidates: p?.candidates ?? [],
    },
    audit: Array.isArray(s.audit) ? s.audit.filter((i) => i.id === post.id) : [],
  };
}

// ---------- Searches ----------
const ARTIST = (a) => ({ mbid: a.id, name: a.name, type: a.type ?? null, country: a.country ?? null, area: a.area?.name ?? null,
  disambiguation: a.disambiguation || null, begin: a["life-span"]?.begin ?? null, end: a["life-span"]?.end ?? null, score: a.score ?? null });
const arid = (v) => { const ids = Array.isArray(v) ? v.map((p) => p.mbid ?? p) : [v]; return ids.length > 1 ? `(${ids.join(" OR ")})` : ids[0]; };

// One candidate per (recording, release group), as match-musicbrainz-posts.mjs builds them.
function recordingCandidates(recordings) {
  const out = [];
  for (const r of recordings) {
    const seen = new Set();
    for (const rel of r.releases ?? []) {
      const g = rel["release-group"];
      if (!g || seen.has(g.id)) continue;
      seen.add(g.id);
      out.push({ key: `${r.id}|${g.id}`, recording: r.id, release_group: g.id, title: r.title, artist: credit(r), disambiguation: r.disambiguation || null,
        length: r.length ?? null, isrcs: r.isrcs ?? [], date: rel.date ?? r["first-release-date"] ?? null, album: g.title ?? rel.title,
        type: g["primary-type"] ?? null, secondary: g["secondary-types"] ?? [], status: rel.status ?? null });
    }
    if (!seen.size) out.push({ key: `${r.id}|`, recording: r.id, release_group: null, title: r.title, artist: credit(r), disambiguation: r.disambiguation || null,
      length: r.length ?? null, isrcs: r.isrcs ?? [], date: r["first-release-date"] ?? null, album: null, type: null, secondary: [], status: null });
  }
  return out;
}
const credit = (x) => (x["artist-credit"] ?? []).map((c) => (c.name ?? c.artist?.name) + (c.joinphrase ?? "")).join("") || null;

export async function searchSource(source, q) {
  const text = q.get("q") ?? "";
  if (source === "mb-artist") return ((await search("artist", `artist:${phrase(text)} OR alias:${phrase(text)}`, 10))?.artists ?? []).map(ARTIST);
  if (source === "mb-recording") {
    const query = [text && `recording:${phrase(text)}`, q.get("arid") && `arid:${arid(JSON.parse(q.get("arid")))}`, q.get("album") && `release:${phrase(q.get("album"))}`].filter(Boolean).join(" AND ");
    return recordingCandidates((await search("recording", query, 25))?.recordings ?? []).slice(0, 40);
  }
  if (source === "mb-release-group") {
    const query = [text && `releasegroup:${phrase(text)}`, q.get("arid") && `arid:${arid(JSON.parse(q.get("arid")))}`].filter(Boolean).join(" AND ");
    return ((await search("release-group", query, 15))?.["release-groups"] ?? []).map((g) => ({
      key: `|${g.id}`, recording: null, release_group: g.id, title: null, artist: credit(g), album: g.title, date: g["first-release-date"] ?? null,
      type: g["primary-type"] ?? null, secondary: g["secondary-types"] ?? [], isrcs: [] }));
  }
  if (source === "youtube") {
    const { stdout } = await run("yt-dlp", ["--flat-playlist", "--print", "%(id)s\t%(title)s\t%(channel)s\t%(duration)s", `ytsearch10:${text}`], { timeout: 60000 });
    return stdout.trim().split("\n").filter(Boolean).map((l) => { const [id, title, channel, duration] = l.split("\t"); return { id, title, channel, duration: Number(duration) || null }; });
  }
  if (source === "apple") {
    const entity = q.get("entity") === "album" ? "album" : "song";
    const res = await fetch(`https://itunes.apple.com/search?country=ES&limit=15&entity=${entity}&term=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`iTunes ${res.status}`);
    return (await res.json()).results.map((r) => ({
      url: entity === "song" ? `https://embed.music.apple.com/es/album/${r.collectionId}?i=${r.trackId}` : `https://embed.music.apple.com/es/album/${r.collectionId}`,
      title: r.trackName ?? r.collectionName, artist: r.artistName, album: r.collectionName, year: r.releaseDate?.slice(0, 4) ?? null,
      seconds: r.trackTimeMillis ? Math.round(r.trackTimeMillis / 1000) : null,
    }));
  }
  throw new Error(`Unknown source ${source}`);
}

// ---------- Choices (saved at once) ----------
// Artist: value = MBID, [{ name, mbid }] (a collaboration) or null (not in MusicBrainz); undefined = undo.
export function chooseArtist(posts, name, value) {
  const key = norm(name), decisions = readJson(FILES.artistDecisions), mb = readData();
  if (value === undefined) delete decisions[key]; else decisions[key] = { mbid: value };
  write(FILES.artistDecisions, decisions);
  // Every spelling of the artist in posts.json shares the decision.
  const names = new Set(posts.map((p) => p.editorMetadata.artist).filter((n) => n && norm(n) === key));
  const auto = readJson(FILES.artists)[key];
  const effective = value !== undefined ? value : auto?.status === "auto" ? auto.pick : null;
  for (const n of names) { if (effective) mb.artists[n] = effective; else delete mb.artists[n]; }
  mb.artists = Object.fromEntries(Object.entries(mb.artists).sort(([a], [b]) => a.localeCompare(b, "es")));
  writeData(mb);
}

// Recording/album of a post: candidate = { recording, release_group, isrcs… } or null (no match); undefined = undo.
export async function chooseRecord(id, candidate) {
  const decisions = readJson(FILES.postDecisions), mb = readData();
  if (candidate === undefined) {
    delete decisions[id];
    const r = readJson(FILES.posts)[id];
    const c = r?.status === "auto" ? r.candidates.find((c) => c.key === r.pick) : null;
    candidate = c ?? null;
  } else decisions[id] = { pick: candidate?.key ?? null, ...(candidate ? { candidate } : {}) };
  write(FILES.postDecisions, decisions);
  if (!candidate) { delete mb.posts[id]; writeData(mb); return null; }
  // ISRCs and the album's first release (recording dates are unreliable), looked up if missing.
  let isrcs = candidate.isrcs ?? [];
  if (candidate.recording && !isrcs.length) isrcs = (await get(`recording/${candidate.recording}?inc=isrcs`))?.isrcs ?? [];
  const groups = readJson(FILES.groups);
  if (candidate.release_group && !(candidate.release_group in groups)) {
    groups[candidate.release_group] = (await get(`release-group/${candidate.release_group}`))?.["first-release-date"] || null;
    write(FILES.groups, groups);
  }
  mb.posts[id] = Object.fromEntries(Object.entries({
    recording: candidate.recording, release_group: candidate.release_group, isrcs: isrcs.length ? isrcs : undefined,
    first_release: (candidate.release_group && groups[candidate.release_group]) || undefined,
  }).filter(([, v]) => v));
  writeData(mb);
  return mb.posts[id];
}
