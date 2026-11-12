// The "Ficha" of a post (pages/post.njk): everything we know about it, in two groups (the music it presents,
// and the post on dSong) of rows { label, items: [{ text, href?, external?, note? }] }, linking each value to its archive page and to its
// source outside (MusicBrainz, the artist's site, the players). Built once per post in lib/posts.js.
import { countryOf } from "./countries.js";
import { norm } from "./musicbrainz.js";
import { playerSources } from "./metadata.js";

const has = (v) => v !== undefined && v !== null && String(v).trim() !== "";
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
// "2008-06-23" -> "23 de junio de 2008", "2008-06" -> "junio de 2008", "2008" -> "2008"
const spanishDate = (d) => {
  const [y, m, day] = d.split("-");
  if (!m) return y;
  return `${day ? `${Number(day)} de ` : ""}${MONTHS[Number(m) - 1]} de ${y}`;
};
const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
// A discreet link next to the value (`musicbrainz`: shown small, with an icon, in pages/post.njk).
const mbLink = (kind, id, text = "MusicBrainz") => ({ text, href: `https://musicbrainz.org/${kind}/${id}`, musicbrainz: true });

// Where each player comes from, said plainly (lib/metadata.js SOURCES).
const VIA = { musicbrainzMetadata: "enlazado en MusicBrainz", spotifyMetadata: "búsqueda automática", ytdlpMetadata: "búsqueda automática", itunesMetadata: "búsqueda automática" };
// The players' own pages (the site embeds them).
const OPEN = {
  youtube_code: (v) => ({ text: "YouTube", href: `https://www.youtube.com/watch?v=${v}` }),
  spotify_url: (v) => ({ text: "Spotify", href: v.replace("open.spotify.com/embed/", "open.spotify.com/") }),
  apple_music_url: (v) => ({ text: "Apple Music", href: v.replace("embed.music.apple.com", "music.apple.com") }),
};

export function postFacts(post, mb) {
  const m = post.metadata, s = post.slugs, rec = post.musicbrainzMetadata ?? {}, music = [], dsong = [];
  let rows = music;
  const add = (label, items) => { items = items.filter(Boolean); if (items.length) rows.push({ label, items }); };
  const artistId = mb.artists?.[post.editorMetadata.artist];
  const info = typeof artistId === "string" ? mb.artistInfo?.[artistId] : null;

  if (has(m.artist)) {
    const links = !artistId ? [] : Array.isArray(artistId)
      ? artistId.filter((a) => a.mbid).map((a) => mbLink("artist", a.mbid, `MusicBrainz: ${a.name}`))
      : [mbLink("artist", artistId)];
    add("Artista", [{ text: m.artist, href: `/archive/artists/${s.artist}.html` }, ...links]);
  }
  const country = countryOf(m.artist_nationality);
  if (country) add("País", [{ text: country.name, href: `/archive/countries/${s.country}.html` }]);
  if (has(m.artist_url)) add("Web", [{ text: host(m.artist_url), href: m.artist_url, external: true }]);
  // MusicBrainz's recording and album only when the site shows their titles (otherwise the match is wrong).
  if (has(m.song)) add("Canción", [{ text: m.song }, rec.recording && has(rec.song) && norm(rec.song) === norm(m.song) && mbLink("recording", rec.recording)]);
  if (has(m.album)) {
    const ownAlbum = rec.release_group && has(rec.album) && norm(rec.album) === norm(m.album);
    add("Álbum", [{ text: m.album, href: `/archive/albums/${s.album}.html` }, ownAlbum && mbLink("release-group", rec.release_group)]);
  }
  if (has(m.year)) {
    const first = rec.first_release?.startsWith(String(m.year)) && rec.first_release.length > 4 ? rec.first_release : null;
    add("Año", [{ text: String(m.year), href: `/archive/years/${s.year}.html`, note: first ? `primera edición: ${spanishDate(first)}` : undefined }]);
  }
  if (has(m.genre)) add("Género", [{ text: m.genre }]);
  const genres = (info?.genres ?? []).filter((g) => norm(g) !== norm(m.genre ?? ""));
  if (genres.length) add("Géneros en MusicBrainz", [{ text: genres.join(", ") }]);
  if (rec.isrcs?.length) add("ISRC", rec.isrcs.map((isrc) => ({ text: isrc })));
  const shown = playerSources(post);
  add("Escuchar en", Object.entries(OPEN).map(([field, open]) => shown[field] && { ...open(shown[field].value), external: true, note: VIA[shown[field].source] }));

  rows = dsong;
  if (has(m.category)) add("Categoría", [{ text: m.category, href: `/archive/categories/${s.category}.html` }]);
  add("Autor", [
    { text: post.editor.name, href: `/archive/editors/${s.editor}.html`, note: has(m.lector) ? "colaboración de un lector" : undefined },
    has(m.lector_web) && { text: host(m.lector_web), href: m.lector_web, external: true },
  ]);
  add("Publicado", [{ text: spanishDate(post.published_at.slice(0, 10)) }]);
  if (has(m.podcast_file)) add("Podcast", [{ text: "UniRadio Jaén (mp3)", href: `https://dsongstatic.jesusmagamu.dev/mp3/podcast/${m.podcast_file}`, external: true }]);
  return [{ title: "Música", rows: music }, { title: "dSong", rows: dsong }].filter((group) => group.rows.length);
}
