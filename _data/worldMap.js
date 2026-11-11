import { readFileSync } from "node:fs";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import { groupBy } from "../lib/posts.js";
import { countryOf } from "../lib/countries.js";

// World map for /mapa/ (map.njk): a static SVG of countries colored by number of posts per
// artist nationality. Geometry from world-atlas (Natural Earth 1:110m), projected at build time.
const WIDTH = 960;
const atlas = JSON.parse(readFileSync(new URL("../node_modules/world-atlas/countries-110m.json", import.meta.url), "utf8"));
const land = feature(atlas, atlas.objects.countries).features.filter((f) => f.id !== "010");   // without Antarctica
const projection = geoNaturalEarth1().fitWidth(WIDTH, { type: "FeatureCollection", features: land });
const path = geoPath(projection).digits(1);
const HEIGHT = Math.ceil(path.bounds({ type: "FeatureCollection", features: land })[1][1]);

// Too small for 1:110m: drawn as dots ([lon, lat])
const DOTS = { "132": [-23.6, 15.1], "234": [-6.9, 62.0], "292": [-5.35, 36.14] };

// Color step by number of posts (map-level-1..5 in the CSS)
const LEVELS = [1, 3, 10, 30, 100];
const level = (count) => LEVELS.filter((min) => count >= min).length;

const shapes = land.map((f) => ({ code: f.id, d: path(f) }));

export default function () {
  const groups = Object.fromEntries(groupBy("country").map((group) => {
    const { code } = countryOf(group.posts[0].metadata.artist_nationality);
    return [code, { name: group.name, slug: group.slug, count: group.posts.length, level: level(group.posts.length) }];
  }));
  return {
    width: WIDTH,
    height: HEIGHT,
    levels: LEVELS,
    countries: shapes.map((shape) => ({ ...shape, ...groups[shape.code] })),
    dots: Object.entries(DOTS).filter(([code]) => groups[code]).map(([code, lonLat]) => {
      const [x, y] = projection(lonLat).map((n) => Math.round(n * 10) / 10);
      return { code, x, y, ...groups[code] };
    }),
  };
}
