// Recognizes versions of a song (live, acoustic, remix…) in titles and MusicBrainz disambiguations.
// Shared by scripts/match-musicbrainz-posts.mjs and scripts/audit-players.mjs, which compare them with
// what each post says it presents (data/post-context.json, `version`).

// Markers of each version kind; `type` is the MusicBrainz release group secondary type, if any.
export const KIND = {
  live: { re: /\b(live|en directo|en vivo|directo|concert|concierto|ao vivo)\b|\s@\s/i, type: "Live" },
  acoustic: { re: /\b(acoustic|acustic|acústic[oa]|unplugged|stripped)\b/i },
  remix: { re: /\b(remix|mix)\b/i, type: "Remix" },
  demo: { re: /\bdemo\b/i, type: "Demo" },
  orchestral: { re: /\b(orchestra|orchestral|symphon\w*|orquesta\w*|sinf[oó]nic\w*)\b/i },
};

// Any non-original version marker. "album version", "original version"… are the studio original.
const ANY_RE = /\b(live|en directo|en vivo|demo|remix|mix|edit|acoustic|acustic|unplugged|instrumental|session|version|karaoke|rehearsal|bbc)\b/i;
export const isVersion = (s = "") => ANY_RE.test(String(s ?? "").replace(/\b(album|original|lp|ep|single|studio|explicit|clean|mono|stereo|remaster(ed)?( \d{4})?)( version)?\b/gi, ""));

// Version kinds named in a text (a player title, an album name…).
export const kindsIn = (s = "") => Object.keys(KIND).filter((k) => KIND[k].re.test(s ?? ""));
