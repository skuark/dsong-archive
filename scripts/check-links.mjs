// Checks that every internal href/src in _site resolves to a file,
// following GitHub Pages rules (/x -> x.html, /x/ -> x/index.html).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SITE = process.argv[2] ?? "_site";   // another output dir: node scripts/check-links.mjs <dir>
const files = readdirSync(SITE, { recursive: true }).filter((f) => f.endsWith(".html"));
const resolves = (url) => {
  const path = join(SITE, decodeURI(url.split(/[?#]/)[0]));
  return [path, `${path}.html`, join(path, "index.html")].some((p) => existsSync(p) && !p.endsWith("/"));
};

const broken = new Map();
for (const file of files) {
  const html = readFileSync(join(SITE, file), "utf8");
  for (const [, url] of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) {
    if (!url.startsWith("//") && !resolves(url)) broken.set(url, file);
  }
}

console.log(`${files.length} pages checked`);
for (const [url, file] of broken) console.error(`broken: ${url} (in ${file})`);
process.exit(broken.size ? 1 : 0);
