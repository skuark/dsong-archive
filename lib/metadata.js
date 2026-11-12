// The metadata the site shows, resolved at build time from two sources that are never mixed in the data:
//   editorMetadata       what dSong's editors wrote (and hand corrections made in `npm run edit`)
//   MusicBrainz          the artist's record (data/musicbrainz.json `artistInfo`, by the artist's MBID)
// One rule per field; when a rule turns out wrong, change the rule (or `preferEditor`), not the data.
import { countryOfAlpha2 } from "./countries.js";

const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";

// mb: { artists: name -> MBID, artistInfo: MBID -> { country, genres, url }, preferEditor: { field: [MBID…] } }
export function resolveMetadata(editor, mb) {
  const m = { ...editor };
  const id = mb.artists?.[m.artist];
  const info = typeof id === "string" ? mb.artistInfo?.[id] : null;   // collaborations: editor only
  if (!info) return m;
  const editorWins = (field) => mb.preferEditor?.[field]?.includes(id) && has(m[field]);
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
