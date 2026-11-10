import { format, parse } from "date-fns";
import MarkdownIt from "markdown-it";
import { posts } from "./lib/posts.js";

export default function(eleventyConfig) {
  eleventyConfig.addGlobalData("env", {
    ELEVENTY_ENV: process.env.ELEVENTY_ENV || "development"
  });

  eleventyConfig.addCollection("posts", () => posts);

  eleventyConfig.addWatchTarget("lib/");

  eleventyConfig.addFilter("formatDate", (dateString, dateFormat) => {
    if (!dateString) {
      return "";
    }
    try {
      const date = parse(dateString, "yyyy-MM-dd HH:mm:ss XX", new Date());
      if (isNaN(date.getTime())) {
        return `Invalid date: ${dateString}`;
      }
      return format(date, dateFormat);
    } catch (e) {
      console.error(`Error formatting date: ${dateString}`, e);
      return `Error with date: ${dateString}`;
    }
  });

  const md = new MarkdownIt({ html: true });
  eleventyConfig.addFilter("markdown", (content) => {
    if (!content) return "";
    return md.render(content);
  });

  eleventyConfig.ignores.add("README.md");

  eleventyConfig.addPassthroughCopy("css/bundle.css");
  eleventyConfig.addPassthroughCopy("js/archive-table-sort.js");
  eleventyConfig.addPassthroughCopy("images/dices.png");
  eleventyConfig.addPassthroughCopy("images/favicon.png");
  eleventyConfig.addPassthroughCopy("images/logo.png");

  return {
    dir: {
      input: ".",
      output: "_site"
    }
  };
};
