import { readFileSync } from "node:fs";
import { groupBy, loadPosts } from "../lib/posts.js";

// Artist name -> MusicBrainz artist id, or [{ name, mbid }] for a collaboration (scripts/match-musicbrainz.mjs --apply)
const musicbrainz = () => {
  try { return JSON.parse(readFileSync("data/musicbrainz.json", "utf8")).artists; } catch { return {}; }
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

// A function, so it's recomputed on every build (and rebuild under `npm run serve`)
export default function () {
  const posts = loadPosts();
  const mbids = musicbrainz();
  const radio = posts
    .map((post) => [post.id, post.title, post.metadata.youtube_code ?? "", spotifyUri(post.metadata.spotify_url)])
    .filter(([, , youtube, spotify], i) => youtube || (spotify && !brokenSpotify(posts[i].metadata.spotify_url)));

  return {
    ids: posts.map(post => post.id),
    byEditor: groupBy("editor"),
    byArtist: groupBy("artist").map((group) => ({ ...group, musicbrainz: musicbrainzLinks(mbids[group.name]) })),
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
    // "On this day" on the home page: posts by publication day ("MM-DD"), oldest year first.
    byDay: Object.entries(Object.groupBy(posts, (post) => post.published_at.slice(5, 10)))
      .map(([day, list]) => ({
        day,
        posts: list.map((post) => ({ id: post.id, title: post.title, year: post.published_at.slice(0, 4), author: post.editor.name })),
      })),
  };
}
