// Writes data/podcast-sizes.json (byte size of each podcast mp3: the RSS <enclosure> requires it) and
// data/podcast-durations.json (its length in seconds: <itunes:duration>, shown by podcast apps).
// The duration comes from the mp3's first frames only (a range request of its first 64 KB): the
// frame count of a Xing/Info or VBRI header if there is one (VBR files), otherwise the audio bytes
// over the first frame's bitrate (CBR).
// The archive's mp3s don't change, so this runs by hand only when podcast_file values change.
// Usage: node scripts/podcast-sizes.mjs
import { readFileSync, writeFileSync } from "node:fs";

const BASE = "https://dsongstatic.jesusmagamu.dev/mp3/podcast/";
const { posts } = JSON.parse(readFileSync("data/posts.json", "utf8"));
const files = [...new Set(posts.map((post) => post.editorMetadata.podcast_file).filter(Boolean))].sort();

// MPEG audio frame header tables: [version][layer] bitrates (kbps) and [version] sample rates
const BITRATES = {
  1: { 1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
       2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
       3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] },
  2: { 1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
       2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
       3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] },
};
const SAMPLE_RATES = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 2.5: [11025, 12000, 8000] };

// Seconds of audio in an mp3 of `size` bytes, from its first bytes; null if no frame header is found
function duration(head, size) {
  // Skip an ID3v2 tag (its size is a 28-bit "syncsafe" integer)
  let start = 0;
  if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
    start = 10 + ((head[6] << 21) | (head[7] << 14) | (head[8] << 7) | head[9]) + (head[5] & 0x10 ? 10 : 0);
  }
  for (let i = start; i + 4 <= head.length; i++) {
    if (head[i] !== 0xff || (head[i + 1] & 0xe0) !== 0xe0) continue;
    const version = { 0: 2.5, 2: 2, 3: 1 }[(head[i + 1] >> 3) & 3];
    const layer = { 1: 3, 2: 2, 3: 1 }[(head[i + 1] >> 1) & 3];
    const bitrate = version && layer && BITRATES[version === 1 ? 1 : 2][layer][head[i + 2] >> 4];
    const sampleRate = version && SAMPLE_RATES[version][(head[i + 2] >> 2) & 3];
    if (!bitrate || !sampleRate) continue;
    const samples = layer === 1 ? 384 : layer === 2 || version === 1 ? 1152 : 576;
    // Xing/Info header (in the first frame, after its side info) or VBRI (32 bytes after the header)
    const mono = (head[i + 3] >> 6) === 3;
    const xing = i + 4 + (version === 1 ? (mono ? 17 : 32) : (mono ? 9 : 17));
    const tag = (at) => String.fromCharCode(...head.subarray(at, at + 4));
    const view = new DataView(head.buffer, head.byteOffset);
    if (["Xing", "Info"].includes(tag(xing)) && view.getUint32(xing + 4) & 1) {
      return (view.getUint32(xing + 8) * samples) / sampleRate;
    }
    if (tag(i + 36) === "VBRI") return (view.getUint32(i + 36 + 14) * samples) / sampleRate;
    return ((size - i) * 8) / (bitrate * 1000);
  }
  return null;
}

const sizes = {};
const durations = {};
const failed = [];
const queue = [...files];
async function worker() {
  for (let file = queue.shift(); file; file = queue.shift()) {
    const res = await fetch(BASE + file, { headers: { Range: "bytes=0-65535" } }).catch(() => null);
    // A 206 says the whole size after the slash: "bytes 0-65535/6927673"
    const length = Number(res?.headers.get("content-range")?.split("/")[1] ?? res?.headers.get("content-length"));
    const head = res?.ok ? new Uint8Array(await res.arrayBuffer()) : null;
    const seconds = head && length > 0 ? duration(head, length) : null;
    if (length > 0) sizes[file] = length;
    if (seconds) durations[file] = Math.round(seconds);
    if (!(length > 0) || !seconds) failed.push(file);
  }
}
await Promise.all(Array.from({ length: 8 }, worker));

const sorted = (object) => Object.fromEntries(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync("data/podcast-sizes.json", JSON.stringify(sorted(sizes), null, 2) + "\n");
writeFileSync("data/podcast-durations.json", JSON.stringify(sorted(durations), null, 2) + "\n");
console.log(`${Object.keys(sizes).length} sizes and ${Object.keys(durations).length} durations written${failed.length ? `, ${failed.length} failed: ${failed.join(", ")}` : ""}`);
