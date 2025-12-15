import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { format, parse } from "date-fns";
import MarkdownIt from "markdown-it";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadPosts() {
  const postPath = path.resolve(__dirname, "data/posts.json");
  const content = fs.readFileSync(postPath, "utf8");
  const data = JSON.parse(content);
  return data.posts;
}

function groupPostsBy(keyFn) {
  const posts = loadPosts();
  const grouped = {};

  for (const post of posts) {
    const key = keyFn(post);
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(post);
  }

  return Object.entries(grouped);
}

export default function(eleventyConfig) {
  eleventyConfig.addCollection("posts", function() {
    return loadPosts();
  });

  eleventyConfig.addCollection("postsByEditor", () =>
    groupPostsBy(post => post.editor.name)
  );

  eleventyConfig.addCollection("postsByArtist", () =>
    groupPostsBy(post => post.metadata.artist)
  );

  eleventyConfig.addCollection("postsByAlbum", () =>
    groupPostsBy(post => `${post.metadata.artist}-${post.metadata.album}`)
  );

  eleventyConfig.addCollection("postsByYear", () =>
    groupPostsBy(post => post.metadata.year)
  );

  eleventyConfig.addCollection("postsByCategory", () =>
    groupPostsBy(post => post.metadata.category)
  );

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
