import { groupBy, loadPosts } from "../lib/posts.js";
import { genreFamily } from "../lib/genres.js";

// Archive landing, "dSong en cifras" (/archive/): totals and rankings computed from posts.json at build time.

// Adds `pct` to [{ count, ... }]: bar width relative to the largest
const withPct = (entries) => {
  const max = Math.max(...entries.map((entry) => entry.count));
  return entries.map((entry) => ({ ...entry, pct: Math.round((entry.count / max) * 1000) / 10 }));
};
const ranked = (entries, limit = Infinity) => withPct(entries.toSorted((a, b) => b.count - a.count).slice(0, limit));
const countBy = (list, key) => Object.entries(Object.groupBy(list, key)).map(([name, items]) => ({ name, count: items.length }));

// Song decade columns: everything before the 1950s in one bucket (26 songs, the oldest from 1713)
const DECADES = ["Antes de 1950", "1950", "1960", "1970", "1980", "1990", "2000", "2010"];
const decadeOf = (year) => (year < 1950 ? DECADES[0] : String(Math.floor(year / 10) * 10));
const decadeLabel = (decade) => (decade === DECADES[0] ? decade : `${decade}s`);
// Publication year rows: 2015–2017 together (45 posts after the daily posts stopped)
const periodOf = (year) => (year >= 2015 ? "2015–2017" : String(year));

// Heatmap shade by share of the row (map-level-1..5 in the CSS)
const LEVELS = [1, 5, 15, 30, 45];
const level = (pct) => LEVELS.filter((min) => pct >= min).length;

export default function () {
  const posts = loadPosts();
  const songYear = (post) => Number(/^(\d{4})/.exec(post.metadata.year ?? "")?.[1]) || undefined;
  const pubYear = (post) => Number(post.published_at.slice(0, 4));
  const dated = posts.filter(songYear);

  // Age of the song when it was posted, median (in years)
  const ages = dated.map((post) => pubYear(post) - songYear(post)).toSorted((a, b) => a - b);
  const oldest = dated.reduce((a, b) => (songYear(b) < songYear(a) ? b : a));

  const periods = Object.groupBy(dated, (post) => periodOf(pubYear(post)));
  const heatmap = Object.entries(periods).map(([period, list]) => {
    const byDecade = Object.groupBy(list, (post) => decadeOf(songYear(post)));
    return {
      period,
      total: list.length,
      cells: DECADES.map((decade) => {
        const count = byDecade[decade]?.length ?? 0;
        const pct = Math.round((count / list.length) * 100);
        return { decade: decadeLabel(decade), count, pct, level: count ? level(pct) : 0 };
      }),
    };
  });

  const withGenre = posts.filter((post) => genreFamily(post.metadata.genre));
  const artists = groupBy("artist").filter((group) => group.name !== "Varios");
  return {
    totals: {
      posts: posts.length,
      editors: groupBy("editor").length,
      artists: artists.length,
      countries: groupBy("country").length,
      podcasts: posts.filter((post) => post.metadata.podcast_file).length,
    },
    byYear: withPct(countBy(posts, pubYear)),
    // Artist groups without "Varios" (compilations), for the /archive/artists/ index
    artistGroups: artists,
    // Full rankings: the page shows the top 10 and the rest under "Ver más" (artists: 3+ posts)
    editors: ranked(groupBy("editor").map((g) => ({ name: g.name, slug: g.slug, count: g.posts.length }))),
    artists: ranked(artists.filter((g) => g.posts.length >= 3).map((g) => ({ name: g.name, slug: g.slug, count: g.posts.length }))),
    genres: ranked(countBy(withGenre, (post) => genreFamily(post.metadata.genre))),
    genreTotal: withGenre.length,
    decades: withPct(DECADES.map((decade) => ({ name: decadeLabel(decade), count: dated.filter((post) => decadeOf(songYear(post)) === decade).length }))),
    heatmap,
    medianAge: ages[Math.floor(ages.length / 2)],
    oldest: { id: oldest.id, title: oldest.title, year: songYear(oldest) },
  };
}
