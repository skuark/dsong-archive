import { readFileSync } from "node:fs";
import { groupBy, loadPosts } from "../lib/posts.js";
import { SPECIAL_TYPES } from "../lib/specials.js";

// Artist name -> MusicBrainz artist id, or [{ name, mbid }] for a collaboration (scripts/match-musicbrainz.mjs --apply)
const musicbrainz = () => {
  try { return JSON.parse(readFileSync("data/musicbrainz.json", "utf8")).artists; } catch { return {}; }
};

// MBID -> { bio, lang, wikipedia, image? } (scripts/artist-bios.mjs), for the artist pages
const artistBios = () => {
  try { return JSON.parse(readFileSync("data/artist-bios.json", "utf8")); } catch { return {}; }
};

// MBID -> [[MBID, score]…] (scripts/related-artists.mjs: ListenBrainz's similar artists inside the archive)
const relatedArtists = () => {
  try { return JSON.parse(readFileSync("data/related-artists.json", "utf8")); } catch { return {}; }
};

// Related artists of each artist page ({ name, slug, posts }, strongest first, at most 8) and, for each
// post, up to three posts of its artist's related ones: of each, the post nearest in date (cross navigation
// under the post, "Si te gusta X")
function relatedOf(artistGroups, mbids) {
  const related = relatedArtists();
  const groupOf = new Map();   // MBID -> artist group (artists linked one to one)
  for (const group of artistGroups) if (typeof mbids[group.name] === "string") groupOf.set(mbids[group.name], group);
  const byArtist = {};
  for (const group of artistGroups) {
    const list = related[mbids[group.name]]?.map(([id]) => groupOf.get(id)).filter((g) => g && g !== group) ?? [];
    if (list.length) byArtist[group.slug] = list.slice(0, 8);
  }
  const byPost = {};
  for (const group of artistGroups) {
    const others = (byArtist[group.slug] ?? []).slice(0, 3);
    if (!others.length) continue;
    for (const post of group.posts) {
      const time = Date.parse(post.published_at);
      byPost[post.id] = others.map((other) => ({ artist: other, post: other.posts
        .reduce((best, p) => (Math.abs(Date.parse(p.published_at) - time) < Math.abs(Date.parse(best.published_at) - time) ? p : best)) }));
    }
  }
  return { byArtist, byPost };
}

// Links to the artist's MusicBrainz page(s): a collaboration ([{ name, mbid }]) links each of its artists.
const musicbrainzLinks = (v) => !v ? null : Array.isArray(v)
  ? v.filter(({ mbid }) => mbid).map(({ name, mbid }) => ({ label: `MusicBrainz: ${name}`, url: `https://musicbrainz.org/artist/${mbid}` }))   // parts not in MusicBrainz: no link
  : [{ label: "MusicBrainz", url: `https://musicbrainz.org/artist/${v}` }];

// Byte size of each podcast mp3 (scripts/podcast-sizes.mjs), for the RSS <enclosure>
const podcastSizes = JSON.parse(readFileSync("data/podcast-sizes.json", "utf8"));
// Its length in seconds (same script), as <itunes:duration> "H:MM:SS"
const podcastDurations = JSON.parse(readFileSync("data/podcast-durations.json", "utf8"));
const hms = (seconds) => seconds ? [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
  .map((n, i) => (i ? String(n).padStart(2, "0") : n)).join(":") : "";

const has = (v) => v != null && v !== "";

// Up to three initials of a name, one per word (Brian Edward Hyde -> BEH, juanje.ra -> JR, AC/DC -> AD),
// or a one-word name's first three letters (skuark -> SKU); punctuation is skipped ("(hed) p.e." -> HPE)
const initials = (name) => {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return (words.length > 1 ? words.slice(0, 3).map((w) => w[0]).join("") : (words[0] ?? "").slice(0, 3)).toLocaleUpperCase("es");
};
const initialsOf = (groups) => Object.fromEntries(groups.map(({ slug, name }) => [slug, initials(name)]).filter(([, i]) => i));

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
    list.push({ id: post.id, title, artist, year: date.slice(0, 4), author: post.editor.name, song: title === song ? undefined : song });
  }
  for (const entry of Object.values(days)) entry.anniversaries.sort((a, b) => a.year - b.year);
  return Object.values(days);
}

// Artist page extras from its latest post: country (name + slug of its page), official site, and the albums
// its posts present ({ name, slug, count }, in order of appearance)
function artistDetails(group) {
  const latest = group.posts.at(-1);
  const country = groupBy("country", [latest])[0];
  const albums = {};
  for (const post of group.posts) {
    if (!post.slugs.album) continue;
    (albums[post.slugs.album] ??= { name: post.metadata.album, slug: post.slugs.album, count: 0 }).count++;
  }
  return { country: country && { name: country.name, slug: country.slug }, url: latest.metadata.artist_url, albums: Object.values(albums) };
}

// A function, so it's recomputed on every build (and rebuild under `npm run serve`)
export default function () {
  const posts = loadPosts();
  const mbids = musicbrainz();
  const bios = artistBios();
  const related = relatedOf(groupBy("artist"), mbids);
  // Radio mode plays YouTube only: posts without a video are left out
  const radio = posts
    .filter((post) => post.metadata.youtube_code)
    .map((post) => [post.id, post.title, post.metadata.youtube_code]);

  return {
    ids: posts.map(post => post.id),
    byEditor: groupBy("editor"),
    // A bio only for artists linked one to one (not collaborations)
    byArtist: groupBy("artist").map((group) => ({ ...group, ...artistDetails(group), musicbrainz: musicbrainzLinks(mbids[group.name]),
      bio: typeof mbids[group.name] === "string" ? bios[mbids[group.name]] : undefined, related: related.byArtist[group.slug] ?? [] })),
    // Post id -> [{ artist, post }…]: posts of related artists, under the post
    relatedPosts: related.byPost,
    // Artist slug -> its Commons photo { src, credit } (data/artist-bios.json), for the cards of /archive/artists/
    artistImages: Object.fromEntries(groupBy("artist").flatMap((group) => {
      const image = typeof mbids[group.name] === "string" && bios[mbids[group.name]]?.image;
      // Its credit too (Commons' reuse terms), shown on hover
      return image ? [[group.slug, { src: image.src, credit: [image.author || "Wikimedia Commons", image.license].filter(Boolean).join(" · ") }]] : [];
    })),
    // Author slug -> their Gravatar (from posts.json's gravatar_url), for the cards of /archive/editors/;
    // d=404: no picture -> the card drops the image (js/archive-table-search.js)
    editorImages: Object.fromEntries(groupBy("editor").flatMap((group) => {
      const url = group.posts.find((post) => post.editor.gravatar_url)?.editor.gravatar_url;
      return url ? [[group.slug, { src: `${url}?s=128&d=404` }]] : [];
    })),
    // Slug -> up to three initials, for the square shown on the index cards without a photo
    editorInitials: initialsOf(groupBy("editor")),
    artistInitials: initialsOf(groupBy("artist")),
    byAlbum: groupBy("album"),
    byYear: groupBy("year"),
    byCategory: groupBy("category"),
    byCountry: groupBy("country"),
    // Radio mode: posts with a YouTube video, chronological, as [id, title, youtubeCode]
    radio,
    radioIds: radio.map((entry) => entry[0]),
    radioById: Object.fromEntries(radio.map((entry) => [entry[0], true])),
    // Podcast index (/archive/podcasts/): chronological, like the other tables
    podcastPosts: posts.filter((post) => post.metadata.podcast_file),
    // Especiales (lib/specials.js): the posts of each shape, chronological, for /archive/especiales/
    specials: SPECIAL_TYPES.map((t) => ({ ...t, posts: posts.filter((post) => post.special?.type === t.type) })),
    specialCount: posts.filter((post) => post.special).length,
    // Festival series: name -> its posts in order, for the series box beside each of them
    series: Object.groupBy(posts.filter((post) => post.special?.series), (post) => post.special.series),
    // Podcast feed (/podcast.xml): posts with a UniRadio Jaén podcast, newest first
    podcast: posts.filter((post) => post.metadata.podcast_file)
      .map((post) => ({ post, file: post.metadata.podcast_file, length: podcastSizes[post.metadata.podcast_file] ?? 0,
        duration: hms(podcastDurations[post.metadata.podcast_file]) }))
      .reverse(),
    // "On this day" on the home page (/tal-dia-como-hoy/MM-DD.json): posts by publication day, oldest year
    // first, and anniversaries: posts whose album (or song) first came out that day, by MusicBrainz's full
    // first_release date; only when it's the year the site shows (else the match was refused) and not a
    // bare 1 January (often a year-only date).
    byDay: onThisDay(posts),
  };
}
