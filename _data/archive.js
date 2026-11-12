import { readFileSync } from "node:fs";
import { groupBy, loadPosts } from "../lib/posts.js";

// Artist name -> MusicBrainz artist id, or [{ name, mbid }] for a collaboration (scripts/match-musicbrainz.mjs --apply)
const musicbrainz = () => {
  try { return JSON.parse(readFileSync("data/musicbrainz.json", "utf8")).artists; } catch { return {}; }
};

// MBID -> { bio, lang, wikipedia, image? } (scripts/artist-bios.mjs), for the artist pages
const artistBios = () => {
  try { return JSON.parse(readFileSync("data/artist-bios.json", "utf8")); } catch { return {}; }
};

// Links to the artist's MusicBrainz page(s): a collaboration ([{ name, mbid }]) links each of its artists.
const musicbrainzLinks = (v) => !v ? null : Array.isArray(v)
  ? v.filter(({ mbid }) => mbid).map(({ name, mbid }) => ({ label: `MusicBrainz: ${name}`, url: `https://musicbrainz.org/artist/${mbid}` }))   // parts not in MusicBrainz: no link
  : [{ label: "MusicBrainz", url: `https://musicbrainz.org/artist/${v}` }];

// Byte size of each podcast mp3 (scripts/podcast-sizes.mjs), for the RSS <enclosure>
const podcastSizes = JSON.parse(readFileSync("data/podcast-sizes.json", "utf8"));

// "https://open.spotify.com/embed/user/x/playlist/ID" -> "spotify:playlist:ID" (for the embed API)
const spotifyUri = (url) => {
  const match = /\/embed\/(?:user\/[^/]+\/)?(track|album|playlist|artist)\/(\w+)/.exec(url ?? "");
  return match ? `spotify:${match[1]}:${match[2]}` : "";
};
// dSong's own playlists are broken (kept on purpose, see AGENTS.md): not playable in the radio
const brokenSpotify = (url) => /\/user\/(dsong2009|skuark|jesusr)\//.test(url ?? "");

const has = (v) => v != null && v !== "";

function onThisDay(posts) {
  const days = {};
  const day = (key) => (days[key] ??= { day: key, posts: [], anniversaries: [] });
  for (const post of posts) {
    day(post.published_at.slice(5, 10)).posts.push({ id: post.id, title: post.title, year: post.published_at.slice(0, 4), author: post.editor.name });
    const rec = post.musicbrainzMetadata, date = rec?.first_release;
    if (!/^\d{4}-\d\d-\d\d$/.test(date ?? "") || date.endsWith("-01-01") || String(post.metadata.year) !== date.slice(0, 4)) continue;
    const { album, song, artist } = post.metadata;
    const title = rec.album && has(album) ? album : song;
    if (!has(title)) continue;
    const list = day(date.slice(5)).anniversaries;
    if (list.some((a) => a.title === title && a.artist === artist)) continue;   // several posts on one album: the first
    list.push({ id: post.id, title, artist, year: date.slice(0, 4) });
  }
  for (const entry of Object.values(days)) entry.anniversaries.sort((a, b) => a.year - b.year);
  return Object.values(days);
}

// A function, so it's recomputed on every build (and rebuild under `npm run serve`)
export default function () {
  const posts = loadPosts();
  const mbids = musicbrainz();
  const bios = artistBios();
  const radio = posts
    .map((post) => [post.id, post.title, post.metadata.youtube_code ?? "", spotifyUri(post.metadata.spotify_url)])
    .filter(([, , youtube, spotify], i) => youtube || (spotify && !brokenSpotify(posts[i].metadata.spotify_url)));

  return {
    ids: posts.map(post => post.id),
    byEditor: groupBy("editor"),
    // A bio only for artists linked one to one (not collaborations)
    byArtist: groupBy("artist").map((group) => ({ ...group, musicbrainz: musicbrainzLinks(mbids[group.name]),
      bio: typeof mbids[group.name] === "string" ? bios[mbids[group.name]] : undefined })),
    byAlbum: groupBy("album"),
    byYear: groupBy("year"),
    byCategory: groupBy("category"),
    byCountry: groupBy("country"),
    // Radio mode: posts with a YouTube video or, failing that, a Spotify embed (30 s previews without a
    // Spotify session), chronological, as [id, title, youtubeCode, spotifyUri].
    radio,
    radioIds: radio.map((entry) => entry[0]),
    radioById: Object.fromEntries(radio.map((entry) => [entry[0], true])),
    // Podcast index (/archive/podcasts/): chronological, like the other tables
    podcastPosts: posts.filter((post) => post.metadata.podcast_file),
    // Podcast feed (/podcast.xml): posts with a UniRadio Jaén podcast, newest first
    podcast: posts.filter((post) => post.metadata.podcast_file)
      .map((post) => ({ post, file: post.metadata.podcast_file, length: podcastSizes[post.metadata.podcast_file] ?? 0 }))
      .reverse(),
    // "On this day" on the home page (/tal-dia-como-hoy/MM-DD.json): posts by publication day, oldest year
    // first, and anniversaries: posts whose album (or song) first came out that day, by MusicBrainz's full
    // first_release date; only when it's the year the site shows (else the match was refused) and not a
    // bare 1 January (often a year-only date).
    byDay: onThisDay(posts),
  };
}
