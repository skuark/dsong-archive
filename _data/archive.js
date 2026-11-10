import { groupBy, posts } from "../lib/posts.js";

export default {
  ids: posts.map(post => post.id),
  byEditor: groupBy("editor"),
  byArtist: groupBy("artist"),
  byAlbum: groupBy("album"),
  byYear: groupBy("year"),
  byCategory: groupBy("category"),
};
