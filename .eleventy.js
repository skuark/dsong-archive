import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { format, parse } from "date-fns";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function(eleventyConfig) {
  eleventyConfig.addCollection("posts", function() {
    const postsDir = path.resolve(__dirname, "_includes/posts");
    const files = fs.readdirSync(postsDir);

    const posts = files
      .filter(file => file.endsWith('.json'))
      .map(file => {
        const filePath = path.join(postsDir, file);
        const content = fs.readFileSync(filePath, "utf8");
        const posts = JSON.parse(content);

        return posts;
      })

    return posts;
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
