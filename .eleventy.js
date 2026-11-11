import MarkdownIt from "markdown-it";
import { posts } from "./lib/posts.js";
import { fontFiles } from "./lib/fonts.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

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

  // Long Spanish date from the same string, e.g. "29 de Mayo de 2009" (", 13:45" with withTime).
  // Months capitalized, as in the home page text.
  const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  eleventyConfig.addFilter("longDate", (dateString, withTime = false) => {
    const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(dateString ?? "");
    if (!match) return dateString ?? "";
    const [, yyyy, MM, dd, HH, mm] = match;
    const date = `${Number(dd)} de ${MONTHS[Number(MM) - 1]} de ${yyyy}`;
    return withTime ? `${date}, ${HH}:${mm}` : date;
  });

  // RFC 822 date for RSS from the same string: "2013-04-25 09:00:00 +0200" -> "Thu, 25 Apr 2013 09:00:00 +0200"
  // (weekday from the calendar date via Date.UTC, so it doesn't depend on the build machine's timezone)
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  eleventyConfig.addFilter("rfc822", (dateString) => {
    const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{4})$/.exec(dateString ?? "");
    if (!match) return dateString ?? "";
    const [, yyyy, MM, dd, time, zone] = match;
    const day = DAYS[new Date(Date.UTC(yyyy, MM - 1, dd)).getUTCDay()];
    return `${day}, ${dd} ${MONTHS_EN[MM - 1]} ${yyyy} ${time} ${zone}`;
  });

  // 1891 -> "1.891" (Spanish thousands separator, also for 4-digit numbers)
  eleventyConfig.addFilter("thousands", (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, "."));

  // "2009-05-18 09:00:37 +0200" -> "2009-05-18T09:00:37+02:00"
  eleventyConfig.addFilter("isoDate", (dateString) =>
    (dateString ?? "").replace(/^(\S+) (\S+) ([+-]\d{2})(\d{2})$/, "$1T$2$3:$4")
  );

  // Content hash for cache busting: changes only when the file changes.
  eleventyConfig.addFilter("assetVersion", (file) =>
    createHash("md5").update(readFileSync(file)).digest("hex").slice(0, 8)
  );

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
  eleventyConfig.ignores.add("scripts/**");   // local tools (review/editor UIs), not site pages

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
