import { groupBy, posts } from "../lib/posts.js";

export default {
  ids: posts.map(post => post.id),
  byEditor: groupBy("editor"),
  byArtist: groupBy("artist"),
  byAlbum: groupBy("album"),
  byYear: groupBy("year"),
  byCategory: groupBy("category"),
  // "On this day" on the home page: posts by publication day ("MM-DD"), oldest year first.
  byDay: Object.entries(Object.groupBy(posts, (post) => post.published_at.slice(5, 10)))
    .map(([day, list]) => ({
      day,
      posts: list.map((post) => ({ id: post.id, title: post.title, year: post.published_at.slice(0, 4), author: post.editor.name })),
    })),
};
