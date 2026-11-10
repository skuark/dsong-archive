// Self-hosted fonts from @fontsource: only the weights/styles and subsets the site uses.
import { readFileSync } from "node:fs";

const SUBSETS = ["latin", "latin-ext"];
export const FONTS = [
  { pkg: "titillium-web", variants: ["400", "400-italic", "700", "700-italic"] },
  { pkg: "amaranth", variants: ["700"] },
];

const dir = (pkg) => `node_modules/@fontsource/${pkg}`;
const blocks = ({ pkg, variants }) =>
  variants.flatMap((variant) =>
    readFileSync(`${dir(pkg)}/${variant}.css`, "utf8")
      .split(/(?=\/\* )/)
      .filter((block) => SUBSETS.some((s) => block.startsWith(`/* ${pkg}-${s}-`)))
  );

// @font-face rules pointing to /fonts/, woff2 only.
export function fontFaceCss() {
  return FONTS.flatMap(blocks)
    .map((block) => block.replace(/url\(\.\/files\/([^)]+)\.woff2\) format\('woff2'\), url\([^)]+\) format\('woff'\)/, "url(/fonts/$1.woff2) format('woff2')"))
    .join("\n");
}

// { "node_modules/.../file.woff2": "fonts/file.woff2" } for passthrough copy.
export function fontFiles() {
  return Object.fromEntries(
    FONTS.flatMap(blocks).map((block) => {
      const file = block.match(/url\(\.\/files\/([^)]+\.woff2)\)/)[1];
      const pkg = FONTS.find((f) => file.startsWith(f.pkg)).pkg;
      return [`${dir(pkg)}/files/${file}`, `fonts/${file}`];
    })
  );
}
