import { groupBy } from "../lib/posts.js";

export default {
  byEditor: groupBy(post => post.editor.name),
  byArtist: groupBy(post => post.metadata.artist),
  byAlbum: groupBy(post => `${post.metadata.artist}-${post.metadata.album}`),
  byYear: groupBy(post => post.metadata.year),
  byCategory: groupBy(post => post.metadata.category),
};
