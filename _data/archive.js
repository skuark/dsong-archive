import { groupBy, posts } from "../lib/posts.js";

// "https://open.spotify.com/embed/user/x/playlist/ID" -> "spotify:playlist:ID" (for the embed API)
const spotifyUri = (url) => {
  const match = /\/embed\/(?:user\/[^/]+\/)?(track|album|playlist|artist)\/(\w+)/.exec(url ?? "");
  return match ? `spotify:${match[1]}:${match[2]}` : "";
};
// dSong's own playlists are broken (kept on purpose, see AGENTS.md): not playable in the radio
const brokenSpotify = (url) => /\/user\/(dsong2009|skuark|jesusr)\//.test(url ?? "");

const radio = posts
  .map((post) => [post.id, post.title, post.metadata.youtube_code ?? "", spotifyUri(post.metadata.spotify_url)])
  .filter(([, , youtube, spotify], i) => youtube || (spotify && !brokenSpotify(posts[i].metadata.spotify_url)));

export default {
  ids: posts.map(post => post.id),
  byEditor: groupBy("editor"),
  byArtist: groupBy("artist"),
  byAlbum: groupBy("album"),
  byYear: groupBy("year"),
  byCategory: groupBy("category"),
  // Radio mode: posts with a YouTube video or, failing that, a Spotify embed (30 s previews without a
  // Spotify session), chronological, as [id, title, youtubeCode, spotifyUri].
  radio,
  radioIds: radio.map((entry) => entry[0]),
  radioById: Object.fromEntries(radio.map((entry) => [entry[0], true])),
  // "On this day" on the home page: posts by publication day ("MM-DD"), oldest year first.
  byDay: Object.entries(Object.groupBy(posts, (post) => post.published_at.slice(5, 10)))
    .map(([day, list]) => ({
      day,
      posts: list.map((post) => ({ id: post.id, title: post.title, year: post.published_at.slice(0, 4), author: post.editor.name })),
    })),
};
