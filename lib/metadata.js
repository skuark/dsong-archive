// The metadata the site shows, resolved at build time from two sources that are never mixed in the data:
//   editorMetadata       what dSong's editors wrote (and hand corrections made in `npm run edit`)
//   musicbrainzMetadata  the post's recording and album in MusicBrainz (song, album, first_release)
//   MusicBrainz          the artist's record (data/musicbrainz.json `artistInfo`, by the artist's MBID)
// One rule per field; when a rule turns out wrong, change the rule (or `preferEditor`), not the data.
import { countryOfAlpha2 } from "./countries.js";
import { norm, similar } from "./musicbrainz.js";

// MusicBrainz uses typographic apostrophes, quotes and hyphens; the editors' data (and what people type) doesn't.
const straight = (s) => s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[\u2010\u2011]/g, "-");
// The same title give or take typos, punctuation, a missing word or an added subtitle ("Bastion" ~ "Bastion: Original Soundtrack").
const sameTitle = (a, b) => { const x = norm(a), y = norm(b); return x === y || similar(x, y) >= 0.6 || (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x))); };
const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";

// mb: { artists: name -> MBID, artistInfo: MBID -> { country, genres, url }, preferEditor: { field: [MBID or post id…] } }
export function resolveMetadata(post, mb) {
  const m = { ...post.editorMetadata }, rec = post.musicbrainzMetadata;
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
  const info = typeof id === "string" ? mb.artistInfo?.[id] : null;   // collaborations: editor only
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
