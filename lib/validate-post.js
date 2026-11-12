// Rules for a single post, shared by scripts/validate-data.mjs and the local editor
// (scripts/edit-posts.mjs). Returns { errors, missing }: errors fail validation, `missing` lists
// the recommended metadata fields that are empty (warnings).
import { PLAYERS, players } from "./metadata.js";
const REASONS = ["broken", "mismatch", "hand"];

export const DATE_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}$/;
export const RECOMMENDED = ["artist", "album", "year", "song"];

export function validatePost(post) {
  const errors = [];
  if (!post.id) errors.push("missing id");
  else if (!/^[a-z0-9-]+$/.test(post.id)) errors.push("id must be lowercase ASCII (a-z, 0-9, -)");

  if (!post.title) errors.push("missing title");
  if (!DATE_RE.test(post.published_at ?? "")) errors.push(`bad published_at "${post.published_at}"`);
  if (!post.editor?.name) errors.push("missing editor.name");
  if (!post.editorMetadata?.category) errors.push("missing metadata.category");

  // Player layers (lib/metadata.js): found players, and the values never to show.
  for (const layer of ["ytdlpMetadata", "spotifyMetadata"]) {
    for (const [field, value] of Object.entries(post[layer] ?? {})) {
      if (!PLAYERS.includes(field) || typeof value !== "string") errors.push(`${layer}.${field} must be a player field with a string value`);
    }
  }
  for (const [field, values] of Object.entries(post.hiddenPlayers ?? {})) {
    if (!PLAYERS.includes(field)) errors.push(`hiddenPlayers.${field} is not a player field`);
    for (const reason of Object.values(values ?? {})) if (!REASONS.includes(reason)) errors.push(`hiddenPlayers.${field}: reason must be ${REASONS.join("/")}`);
  }
  const spotify = players(post).spotify_url;
  if (spotify && !/^https:\/\/open\.spotify\.com\/embed\//.test(spotify)) errors.push("spotify_url must be an embed URL (https://open.spotify.com/embed/...)");

  for (const comment of post.comments ?? []) {
    if (!DATE_RE.test(comment.published_at ?? "")) errors.push(`bad comment date "${comment.published_at}"`);
  }


  const missing = RECOMMENDED.filter((field) => !post.editorMetadata?.[field]);
  return { errors, missing };
}

// Serializes the posts file keeping it byte-identical: 2-space JSON, trailing newline and
// U+007F–U+009F escaped as \uXXXX (as in the original export).
export const serializePosts = (data) =>
  JSON.stringify(data, null, 2).replace(/[\u007f-\u009f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`) + "\n";
