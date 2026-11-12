import { readFileSync } from "node:fs";
import { loadPosts } from "../lib/posts.js";

// "El proyecto" (/el-proyecto/): dSong's history by year. Milestones "del archivo" come from posts.json
// (first post, every 500th, the authors who joined each year, festival series, dSong's
// anniversaries, first and last podcast, the most commented post); the "contado" ones are written by
// hand in data/historia.json.
const told = () => JSON.parse(readFileSync("data/historia.json", "utf8")).items;
const date = (post) => post.published_at.slice(0, 10);
const link = (post) => ({ url: `/archive/${post.id}.html`, label: post.title });
const names = (list) => (list.length > 1 ? `${list.slice(0, -1).join(", ")} y ${list.at(-1)}` : list[0]);

export default function () {
  const posts = loadPosts();
  const items = [];
  const add = (item) => items.push({ kind: "archivo", ...item });

  add({ date: date(posts[0]), title: "El primer artículo", text: `Lo firmó ${posts[0].editor.name}.`, link: link(posts[0]) });
  for (const n of [500, 1000, 1500]) {
    const post = posts[n - 1];
    if (post) add({ date: date(post), title: `El artículo nº ${n.toLocaleString("es-ES")}`, text: `De ${post.editor.name}.`, link: link(post) });
  }

  // Authors who joined, one milestone a year (the day of the first of them)
  const seen = new Set();
  const joined = {};
  for (const post of posts) {
    if (seen.has(post.editor.name)) continue;
    seen.add(post.editor.name);
    (joined[post.published_at.slice(0, 4)] ??= []).push(post);
  }
  for (const [i, [year, list]] of Object.entries(joined).entries()) {
    const who = list.map((post) => post.editor.name);
    add({
      date: date(list[0]),
      title: i === 0 ? `Los primeros ${list.length} autores` : list.length === 1 ? `Se une ${who[0]}` : `${list.length} autores se unen en ${year}`,
      text: list.length === 1 ? "Su primer artículo." : `${names(who)}.`,
      link: list.length === 1 ? link(list[0]) : undefined,
    });
  }

  // Festival series: their first day
  const series = new Set();
  for (const post of posts) {
    const name = post.special?.series;
    if (!name || series.has(name)) continue;
    series.add(name);
    const days = posts.filter((p) => p.special?.series === name).length;
    add({ date: date(post), title: `Especial ${name}`, text: `${days} artículos seguidos, un grupo al día.`, link: link(post) });
  }

  for (const post of posts.filter((p) => /Aniversario de dSong/i.test(p.title) && !/2ª Parte/i.test(p.title))) {
    add({ date: date(post), title: post.title.replace(/^Especial\s+/i, "").replace(/\s*\(1ª Parte\)/i, ""), text: `Lo celebró ${post.editor.name}.`, link: link(post) });
  }

  const podcasts = posts.filter((post) => post.metadata.podcast_file);
  if (podcasts.length) {
    add({ date: date(podcasts[0]), title: "Primer podcast en UniRadio Jaén", text: `El primero de ${podcasts.length} programas.`, link: link(podcasts[0]) });
    add({ date: date(podcasts.at(-1)), title: "Último podcast", text: "El último programa en UniRadio Jaén.", link: link(podcasts.at(-1)) });
  }

  const commented = posts.reduce((a, b) => ((b.comments?.length ?? 0) > (a.comments?.length ?? 0) ? b : a));
  add({ date: date(commented), title: "El más comentado", text: `${commented.comments.length} comentarios.`, link: link(commented) });

  for (const item of told()) items.push({ kind: "contado", ...item });

  // By year, with each year's number of posts (bar relative to the busiest year)
  const perYear = Object.groupBy(posts, (post) => post.published_at.slice(0, 4));
  const max = Math.max(...Object.values(perYear).map((list) => list.length));
  const years = Object.entries(Object.groupBy(items.toSorted((a, b) => a.date.localeCompare(b.date) || (a.kind === "contado" ? -1 : b.kind === "contado" ? 1 : 0)), (item) => item.date.slice(0, 4)))
    .map(([year, list]) => ({ year, count: perYear[year]?.length ?? 0, pct: Math.round(((perYear[year]?.length ?? 0) / max) * 100), items: list }));

  return {
    years,
    totals: {
      comments: posts.reduce((sum, post) => sum + (post.comments?.length ?? 0), 0),
    },
  };
}
