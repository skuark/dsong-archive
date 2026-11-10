// Old URLs that changed when slugs were fixed, mapped to their new location.
// Previously, missing fields were slugified as the string "undefined".
import { posts, slugify } from "../lib/posts.js";

const redirects = new Map();
const add = (from, to) => from !== to && redirects.set(from, to);

for (const post of posts) {
  const { artist, album, year } = post.metadata;
  const artistPage = artist ? `/archive/artists/${slugify(artist)}.html` : "/archive/";

  // Albums: "<artist>-undefined" / "undefined-<album>" / "undefined-undefined"
  const oldAlbum = `/archive/albums/${slugify(`${artist}-${album}`)}.html`;
  if (!album) add(oldAlbum, artistPage);
  else if (!artist) add(oldAlbum, `/archive/albums/${post.slugs.album}.html`);

  if (!artist) add("/archive/artists/undefined.html", "/archive/");
  // Years used the raw value (e.g. "Siglo XVII") or "undefined"
  if (!year) add("/archive/years/undefined.html", "/archive/");
  else add(`/archive/years/${year}.html`, `/archive/years/${post.slugs.year}.html`);
}

export default [...redirects].map(([from, to]) => ({ from, to }));
