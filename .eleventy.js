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

export default function(eleventyConfig) {
  eleventyConfig.addCollection("posts", function() {
    return loadPosts();
  });

  eleventyConfig.addCollection("postsByEditor", (collection) => {
    const posts = loadPosts();
    const postsByEditor = {};

    for (const post of posts) {
      const editor = post.editor.name;
      if (!postsByEditor[editor]) {
        postsByEditor[editor] = [];
      }
      postsByEditor[editor].push(post);
    }

    return Object.entries(postsByEditor);
  });

  eleventyConfig.addCollection("postsByArtist", (collection) => {
    const posts = loadPosts();
    const postsByArtist = {};

    for (const post of posts) {
      const artist = post.metadata.artist;
      if (!postsByArtist[artist]) {
        postsByArtist[artist] = [];
      }
      postsByArtist[artist].push(post);
    }

    return Object.entries(postsByArtist);
  });

  eleventyConfig.addCollection("postsByAlbum", (collection) => {
    const posts = loadPosts();
    const postsByAlbum = {};

    for (const post of posts) {
      const artist = post.metadata.artist;
      const album = `${artist}-${post.metadata.album}`;
      if (!postsByAlbum[album]) {
        postsByAlbum[album] = [];
      }
      postsByAlbum[album].push(post);
    }

    return Object.entries(postsByAlbum);
  });

  eleventyConfig.addCollection("postsByYear", (collection) => {
    const posts = loadPosts();
    const postsByYear = {};

    for (const post of posts) {
      const year = post.metadata.year;
      if (!postsByYear[year]) {
        postsByYear[year] = [];
      }
      postsByYear[year].push(post);
    }

    return Object.entries(postsByYear);
  });

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
