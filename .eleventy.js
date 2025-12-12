import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { format, parse } from "date-fns";

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

  eleventyConfig.addCollection("postsByAuthor", (collection) => {
    const posts = loadPosts();
    const postsByAuthor = {};

    for (const post of posts) {
      const authorName = post.author.name;
      if (!postsByAuthor[authorName]) {
        postsByAuthor[authorName] = [];
      }
      postsByAuthor[authorName].push(post);
    }

    return Object.entries(postsByAuthor);
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
