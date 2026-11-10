import { groupBy } from "../lib/posts.js";

export default {
  byEditor: groupBy("editor"),
  byArtist: groupBy("artist"),
  byAlbum: groupBy("album"),
  byYear: groupBy("year"),
  byCategory: groupBy("category"),
};
