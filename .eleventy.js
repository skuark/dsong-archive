import MarkdownIt from "markdown-it";
import { loadPosts } from "./lib/posts.js";
import { fontFiles } from "./lib/fonts.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export default function(eleventyConfig) {
  eleventyConfig.addGlobalData("env", {
    ELEVENTY_ENV: process.env.ELEVENTY_ENV || "development"
  });

  eleventyConfig.addCollection("posts", () => loadPosts());

  eleventyConfig.addWatchTarget("lib/");
  eleventyConfig.addWatchTarget("data/");   // posts.json is imported from lib/posts.js (e.g. saves from npm run edit)

  // Formats "yyyy-MM-dd HH:mm:ss +ZZZZ" keeping the original local time
  // (no Date parsing, so the result doesn't depend on the build machine's timezone).
  eleventyConfig.addFilter("formatDate", (dateString, dateFormat) => {
    const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(dateString ?? "");
    if (!match) return dateString ?? "";
    const [, yyyy, MM, dd, HH, mm] = match;
    const parts = { yyyy, MM, dd, HH, mm };
    return dateFormat.replace(/yyyy|MM|dd|HH|mm/g, (token) => parts[token]);
  });

  // Long Spanish date from the same string, e.g. "29 de mayo de 2009" (", 13:45" with withTime;
  // "viernes, 29 de mayo de 2009" with weekday: from the calendar date via Date.UTC, so it doesn't depend
  // on the build machine's timezone).
  const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  eleventyConfig.addFilter("longDate", (dateString, withTime = false, weekday = false) => {
    const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(dateString ?? "");
    if (!match) return dateString ?? "";
    const [, yyyy, MM, dd, HH, mm] = match;
    let date = `${Number(dd)} de ${MONTHS[Number(MM) - 1]} de ${yyyy}`;
    if (weekday) date = `${WEEKDAYS[new Date(Date.UTC(yyyy, MM - 1, dd)).getUTCDay()]}, ${date}`;
    return withTime ? `${date}, ${HH}:${mm}` : date;
  });

  // Weekday and day, e.g. "lun 8" (festival series)
  eleventyConfig.addFilter("weekDay", (dateString) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateString ?? "");
    if (!match) return dateString ?? "";
    const [, yyyy, MM, dd] = match;
    return `${WEEKDAYS[new Date(Date.UTC(yyyy, MM - 1, dd)).getUTCDay()].slice(0, 3)} ${Number(dd)}`;
  });

  // Short Spanish date for lists, e.g. "29 may 2009"
  eleventyConfig.addFilter("shortDate", (dateString) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateString ?? "");
    if (!match) return dateString ?? "";
    const [, yyyy, MM, dd] = match;
    return `${Number(dd)} ${MONTHS[Number(MM) - 1].slice(0, 3)} ${yyyy}`;
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

  // Minutes to read a post (200 words a minute, at least 1).
  eleventyConfig.addFilter("readingTime", (content) => {
    const words = md.render(content ?? "").replace(/<[^>]*>/g, " ").split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 200));
  });

  // "Song, de Artist" -> { main: "Song", by: "Artist" } for the post heading ("de Artist" under the title);
  // titles without ", de " (some specials) stay whole.
  eleventyConfig.addFilter("splitTitle", (title) => {
    const at = title.lastIndexOf(", de ");
    return at > 0 ? { main: title.slice(0, at), by: title.slice(at + 5) } : { main: title };
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
