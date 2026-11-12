// The metadata the site shows, resolved at build time from sources that are never mixed in the data:
//   editorMetadata       what dSong's editors wrote (and hand corrections made in `npm run edit`)
//   hiddenPlayers        players never to show (broken, or not the recording the post presents)
//   musicbrainzMetadata  the post's recording and album in MusicBrainz (song, album, first_release, players)
//   spotifyMetadata      Spotify players found with the Web API (find-spotify; parked: needs Premium)
//   ytdlpMetadata        YouTube videos found by searching (find-youtube, fix-players)
//   MusicBrainz          the artist's record (data/musicbrainz.json `artistInfo`, by the artist's MBID)
// One rule per field; when a rule turns out wrong, change the rule (or `preferEditor`), not the data.
import { countryOf, countryOfAlpha2 } from "./countries.js";
import { norm, similar } from "./musicbrainz.js";

// MusicBrainz uses typographic apostrophes, quotes and hyphens; the editors' data (and what people type) doesn't.
const straight = (s) => s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[\u2010\u2011]/g, "-");
// The same title give or take typos, punctuation, a missing word or an added subtitle ("Bastion" ~ "Bastion: Original Soundtrack").
const sameTitle = (a, b) => { const x = norm(a), y = norm(b); return x === y || similar(x, y) >= 0.6 || (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x))); };
const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";

export const PLAYERS = ["youtube_code", "spotify_url", "apple_music_url"];

// Spotify players must be embed URLs (others render an empty iframe): play.spotify.com/track/X,
// www.spotify.com/…, open.spotify.com/track/X -> https://open.spotify.com/embed/track/X.
export function spotifyEmbed(url) {
  const m = /^https?:\/\/(?:play|open|www)\.spotify\.com\/(?:embed\/)?(.+)$/.exec(String(url ?? "").trim());
  return m ? `https://open.spotify.com/embed/${m[1].replace(/\?.*$/, "")}` : url;
}

// YouTube ids are 11 characters; some original ones carry the URL's tail ("d-tKf-XmT2A&feature=kp").
export const youtubeId = (code) => /^[\w-]{11}/.exec(String(code ?? "").trim())?.[0] ?? code;

// Player sources, in order of preference: the editor's own player; the one MusicBrainz links to the matched
// recording/album (scripts/musicbrainz-players.mjs); one found by searching YouTube (yt-dlp: find-youtube,
// fix-players). `hiddenPlayers` lists values never to show, from any source: { field: { value: reason } }
// ("broken": dead embed; "mismatch": not the recording the post presents; "hand": removed in the editor).
export const SOURCES = ["editorMetadata", "musicbrainzMetadata", "spotifyMetadata", "ytdlpMetadata"];
const normalize = (field, v) => (!has(v) ? null : field === "spotify_url" ? spotifyEmbed(v) : field === "youtube_code" ? youtubeId(v) : v);

// The player a post shows for each field, and where it comes from.
export function playerSources(post) {
  const out = {};
  for (const field of PLAYERS) {
    for (const source of SOURCES) {
      const v = normalize(field, post[source]?.[field]);
      if (v && !post.hiddenPlayers?.[field]?.[v]) { out[field] = { value: v, source }; break; }
    }
  }
  return out;
}
export const players = (post) => Object.fromEntries(Object.entries(playerSources(post)).map(([f, { value }]) => [f, value]));
// editorMetadata with the effective players: what the player scripts work on.
export const effective = (post) => {
  const m = { ...post.editorMetadata };
  for (const field of PLAYERS) delete m[field];
  return { ...m, ...players(post) };
};

// Post keys in a fixed order: the layers right after editorMetadata (empty ones dropped).
const LAYERS = ["hiddenPlayers", "musicbrainzMetadata", "spotifyMetadata", "ytdlpMetadata"];
export function ordered(post) {
  const out = {};
  for (const [k, v] of Object.entries(post)) {
    if (LAYERS.includes(k)) continue;
    out[k] = v;
    if (k === "editorMetadata") for (const l of LAYERS) if (post[l] && Object.keys(post[l]).length) out[l] = post[l];
  }
  return out;
}
const replaceWith = (post, next) => { for (const k of Object.keys(post)) delete post[k]; Object.assign(post, next); };

export function hidePlayer(post, field, value, reason) {
  const hidden = structuredClone(post.hiddenPlayers ?? {});
  (hidden[field] ??= {})[normalize(field, value)] = reason;
  replaceWith(post, ordered({ ...post, hiddenPlayers: hidden }));
}
// Make the post show `value` for `field` (null: show none), found by `source` (a layer, ytdlpMetadata by
// default): stores it there and hides whatever would show before it, with `reason`.
export function setPlayer(post, field, value, { source = "ytdlpMetadata", reason = "mismatch" } = {}) {
  const v = normalize(field, value);
  if (v) {
    const layer = { ...post[source], [field]: value };
    const hidden = structuredClone(post.hiddenPlayers ?? {});
    if (hidden[field]) { delete hidden[field][v]; if (!Object.keys(hidden[field]).length) delete hidden[field]; }
    replaceWith(post, ordered({ ...post, [source]: layer, hiddenPlayers: hidden }));
  }
  for (let shown = players(post)[field]; shown && shown !== v; shown = players(post)[field]) hidePlayer(post, field, shown, reason);
}

// What MusicBrainz says for each field, whether the site uses it or not (to compare in the editor).
export function musicbrainzValues(post, mb) {
  const rec = post.musicbrainzMetadata ?? {}, id = mb.artists?.[post.editorMetadata.artist];
  const info = typeof id === "string" ? mb.artistInfo?.[id] : null;
  const out = {
    song: rec.song && straight(rec.song), album: rec.album && straight(rec.album), year: rec.first_release?.slice(0, 4),
    genre: info?.genres?.join(", "), artist_nationality: countryOfAlpha2(info?.country)?.name, artist_url: info?.url,
  };
  for (const field of PLAYERS) out[field] = normalize(field, rec[field]);
  return Object.fromEntries(Object.entries(out).filter(([, v]) => has(v)));
}
// Whether the editor's value and MusicBrainz's are the same (give or take case, punctuation, protocol…).
export function sameAsMusicbrainz(field, editor, mbValue, { countryOf } = {}) {
  if (!has(editor) || !has(mbValue)) return false;
  if (field === "genre") return mbValue.split(", ").some((g) => norm(g) === norm(editor));
  if (field === "artist_nationality") return countryOf?.(editor)?.name === mbValue;
  if (field === "artist_url") return bareUrl(editor) === bareUrl(mbValue);
  if (PLAYERS.includes(field)) return normalize(field, editor) === mbValue;
  return norm(editor) === norm(mbValue);
}
const bareUrl = (u) => String(u).trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");

// mb: { artists: name -> MBID, artistInfo: MBID -> { country, genres, url }, preferEditor: { field: [MBID or post id…] } }
export function resolveMetadata(post, mb) {
  const m = effective(post), rec = post.musicbrainzMetadata;
  const id = mb.artists?.[m.artist];
  const editorWins = (field) => (mb.preferEditor?.[field]?.includes(id) || mb.preferEditor?.[field]?.includes(post.id)) && has(m[field]);
  // Song and album: MusicBrainz's titles of the recording and album the post was matched to (typos, casing),
  // but only when they're recognizably the editor's (a very different title is another single, compilation or
  // song: a wrong match, left to musicbrainz-diffs). Year: the album's first release, never later than the
  // editor's (later = the match is a reissue or a compilation); only with the album accepted.
  const song = rec?.song && straight(rec.song), album = rec?.album && straight(rec.album);
  if (song && !editorWins("song") && (!has(m.song) || sameTitle(song, m.song))) m.song = song;
  const albumOk = album && !editorWins("album") && (!has(m.album) || sameTitle(album, m.album));
  if (albumOk) m.album = album;
  const year = rec?.first_release?.slice(0, 4), limit = has(m.year) ? String(m.year).slice(0, 4) : post.published_at.slice(0, 4);
  if (year && (albumOk || !rec.album) && !editorWins("year") && year <= limit) m.year = year;
  // A collaboration ("X y Y": [{ name, mbid }]): the country its artists share; if they differ, the editor's
  // when it's one of them, otherwise the first artist's. Other artist fields stay the editor's.
  if (Array.isArray(id)) {
    const countries = id.map((part) => countryOfAlpha2(mb.artistInfo?.[part.mbid]?.country)?.name).filter(Boolean);
    const ownCountry = countryOf(m.artist_nationality)?.name;
    if (countries.length && !editorWins("artist_nationality")) m.artist_nationality = new Set(countries).size === 1 || !countries.includes(ownCountry) ? countries[0] : ownCountry;
    return m;
  }
  const info = typeof id === "string" ? mb.artistInfo?.[id] : null;
  if (!info) return m;
  // Nationality: MusicBrainz country (the editors' values have typos and regions), unless MusicBrainz has
  // the country of residence and not of origin (preferEditor: Yoko Ono, Gloria Estefan…).
  const country = countryOfAlpha2(info.country);
  if (country && !editorWins("artist_nationality")) m.artist_nationality = country.name;
  // Website: always the official homepage when MusicBrainz has one (the editors' are often MySpace,
  // Wikipedia or dead 2009-era domains).
  if (info.url) m.artist_url = info.url;
  // Genre: the editor's (it describes that song); the artist's top MusicBrainz genre only when there's none.
  if (!has(m.genre) && info.genres?.[0]) m.genre = info.genres[0][0].toUpperCase() + info.genres[0].slice(1);
  return m;
}
