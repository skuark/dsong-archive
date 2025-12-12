import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { format, parse } from "date-fns";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function(eleventyConfig) {
  eleventyConfig.addCollection("posts", function() {
    const dataPath = path.resolve(__dirname, "data/posts.json");
    const content = fs.readFileSync(dataPath, "utf8");
    const data = JSON.parse(content);
    return data.posts;
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
