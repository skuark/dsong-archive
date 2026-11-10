import MarkdownIt from "markdown-it";
import { posts } from "./lib/posts.js";
import { fontFiles } from "./lib/fonts.js";

export default function(eleventyConfig) {
  eleventyConfig.addGlobalData("env", {
    ELEVENTY_ENV: process.env.ELEVENTY_ENV || "development"
  });

  eleventyConfig.addCollection("posts", () => posts);

  eleventyConfig.addWatchTarget("lib/");

  // Formats "yyyy-MM-dd HH:mm:ss +ZZZZ" keeping the original local time
  // (no Date parsing, so the result doesn't depend on the build machine's timezone).
  eleventyConfig.addFilter("formatDate", (dateString, dateFormat) => {
    const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(dateString ?? "");
    if (!match) return dateString ?? "";
    const [, yyyy, MM, dd, HH, mm] = match;
    const parts = { yyyy, MM, dd, HH, mm };
    return dateFormat.replace(/yyyy|MM|dd|HH|mm/g, (token) => parts[token]);
  });

  const md = new MarkdownIt({ html: true });
  eleventyConfig.addFilter("markdown", (content) => {
    if (!content) return "";
    return md.render(content);
  });

  // Plain-text summary for meta descriptions, cut at a word boundary.
  eleventyConfig.addFilter("excerpt", (content, length = 160) => {
    if (!content) return "";
    const html = md.render(content).replace(/<[^>]*>/g, " ");
    const text = md.utils.unescapeAll(html).replace(/\s+/g, " ").trim();
    if (text.length <= length) return text;
    return text.slice(0, text.lastIndexOf(" ", length - 1)).replace(/[,;:.]$/, "") + "…";
  });

  eleventyConfig.ignores.add("*.md");

  eleventyConfig.addPassthroughCopy("css");
  eleventyConfig.addPassthroughCopy("js");
  eleventyConfig.addPassthroughCopy("images");
  eleventyConfig.addPassthroughCopy(fontFiles());

  return {
    dir: {
      input: ".",
      output: "_site"
    }
  };
};
