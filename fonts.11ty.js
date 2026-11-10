import { fontFaceCss } from "./lib/fonts.js";

export const data = { permalink: "/css/fonts.css", eleventyExcludeFromCollections: true };
export const render = () => fontFaceCss();
