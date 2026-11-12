# AGENTS.md

Static archive of the dSong music blog (2009–2017), built with Eleventy 3 + Nunjucks and deployed to GitHub Pages (`dsong.es`). `CLAUDE.md` is a symlink to this file: keep it updated on structural changes.

## Commands

| Command | What it does |
|---|---|
| `npm run serve` | Dev server with reload (`http://localhost:8080`) |
| `npm run build` | Build to `_site/` (`ELEVENTY_ENV=production` enables analytics) |
| `npm run validate` | Validate `data/posts.json` (errors fail, warnings inform) |
| `npm run check-links` | Check internal links in `_site/` (run after build) |
| `npm run check-media [report.json]` | Check YouTube/Spotify embeds still exist (slow, external; run by hand, not in CI) |
| `npm run find-youtube [-- --apply]` | Find YouTube videos for posts without one via yt-dlp (no API key) into `youtube-candidates.json`; review, then `--apply` |
| `npm run edit` | Local editor (`http://localhost:8082`, 127.0.0.1 only) for text, metadata, players and comments; validates and writes `data/posts.json` byte-identically |
| `npm run review-youtube` | Local UI (`http://localhost:8081`) to review those candidates; decisions go to `youtube-review.json` and win on `--apply` |
| `npm run match-musicbrainz [-- --apply]` | Match each artist to a MusicBrainz artist (MBID, no key, 1 req/s, ~1 h) into `musicbrainz-candidates.json`, confirmed by its songs/albums; `--apply` writes `data/musicbrainz.json` |
| `npm run review-musicbrainz` | Local UI (`http://localhost:8083`) to review the unconfirmed matches; decisions go to `musicbrainz-review.json` and win on `--apply` |

CI (`.github/workflows/deploy-to-ghpages.yml`): `npm ci` → validate → build → check-links → deploy (only from `main`). Node version comes from `.nvmrc`.

## Structure

```
data/posts.json        Source data (~1,900 posts). Not in _data on purpose (see below).
data/podcast-sizes.json Byte size of each podcast mp3 (RSS <enclosure> needs it).
data/musicbrainz.json  Artist name (as in posts.json) -> MusicBrainz artist id, from match-musicbrainz --apply.
data/redirects.json    Frozen list of old URL -> new URL (meta refresh pages via redirect.njk).
lib/posts.js           Loads posts once, adds `post.slugs`, exports `posts`, `groupBy`, `slugify`.
lib/genres.js          metadata.genre (243 free-text values) -> broad family (Rock, Indie y alternativo…), for the archive landing (/archive/).
lib/countries.js       artist_nationality (free text, EN/ES) -> country { code (ISO numeric), name (Spanish) }.
_data/archive.js       Global `archive`: ids + byEditor/byArtist/byAlbum/byYear/byCategory/byCountry + byDay ("MM-DD") + radio.
_data/worldMap.js      Global `worldMap`: country SVG paths (visionscarto-world-atlas 110m, d3-geo) + post counts, for /mapa/.
_data/stats.js         Global `stats`: totals, rankings, decades and decade x year heatmap for the archive landing (/archive/).
_data/site.js          Global `site`: url, title, description, umamiId.
_data/redirects.js     Exposes data/redirects.json as `redirects`.
lib/validate-post.js   Per-post rules + byte-identical posts.json writer (validate-data and the editor).
lib/fonts.js           Self-hosted @fontsource fonts: used weights/subsets only (fonts.11ty.js -> /css/fonts.css).
js/                    archive-table-sort.js, archive-table-search.js (accent-insensitive filter, ?q=),
                       players.js (post players as tabs inside a <details>; lazy-loads via data-src).
                       post-header.js (sticky post header height -> --post-header-height for the split view),
                       on-this-day.js (home "Tal día como hoy": fetches today's JSON in the browser),
                       radio.js (radio mode: swaps posts in place keeping the live YouTube/Spotify players, their iframe APIs).
.eleventy.js           Filters (formatDate, markdown, excerpt), `posts` collection, passthrough.
*.njk                  Pages: index, archive, post, archive-<facet>, rand, sitemap, robots.
_includes/layouts/     main.njk (head, SEO meta, header).
_includes/partials/    archive-table.njk (sortable table, js/archive-table-sort.js).
scripts/               validate-data.mjs, check-links.mjs, check-media.mjs, find-youtube.mjs, review-youtube.mjs (+ .html),
                       match-musicbrainz.mjs, review-musicbrainz.mjs (+ .html),
                       podcast-sizes.mjs (mp3 sizes -> data/podcast-sizes.json, for the feed; run by hand),
                       edit-posts.mjs (+ .html, local editor).
```

## Generated pages

| Template | Data | URL |
|---|---|---|
| `post.njk` | `collections.posts` | `/archive/<id>.html` |
| `archive-<facet>.njk` | `archive.by<Facet>` (`{ name, slug, posts }`) | `/archive/<facets>/<slug>.html` |
| `archive-editors.njk`, `archive-artists.njk` | `archive.byEditor`, `stats.artistGroups` | `/archive/editors/`, `/archive/artists/` (indexes: searchable cards with name + count, partials/facet-index.njk) |
| `archive-podcasts.njk` | `archive.podcastPosts` | `/archive/podcasts/` (table of the podcast posts) |
| `archive-all.njk` | `collections.posts` | `/archive/all/` (the full table) |
| `archive.njk` | `stats` | `/archive/` (landing: search form + "dSong en cifras", static HTML/CSS charts, top 10s with a "Ver más" <details>) |
| `map.njk` | `worldMap`, `archive.byCountry` | `/mapa/` (static SVG world map by artist nationality) |
| `rand.njk` | `archive.ids` | `/rand/` (redirects to a random post) |
| `radio.njk` | `archive.radio` | `/radio.json` (posts with YouTube, or else a playable Spotify embed, for radio mode) |
| `podcast-feed.njk` | `archive.podcast` | `/podcast.xml` (RSS + iTunes tags for the 335 UniRadio podcasts) |
| `on-this-day.njk` | `archive.byDay` | `/tal-dia-como-hoy/<MM-DD>.json` (only days with posts) |
| `redirect.njk` | `redirects` | each old URL (meta refresh + canonical) |
| `404.njk` | — | `/404.html` (served by GitHub Pages) |

## Decisions (don't undo without a reason)

- **posts.json lives in `data/`, not `_data/`**: avoids an automatic global `posts` that clashes with `{% set posts %}` in templates; it's read in `lib/posts.js` (`loadPosts()`, with fs and re-parsed only when the file changes, so `npm run serve` rebuilds on edits; `_data/archive.js` is a function for the same reason).
- **Slugs are precomputed and memoized** in `lib/posts.js` (slugify costs ~0.3 ms/call).
- **`@sindresorhus/slugify` pinned to v2** (same as Eleventy's filter). v4 changes some slugs and would break URLs; Dependabot ignores its majors.
- **`formatDate` parses the string, not `Date`**: shows the original local time and doesn't depend on the build machine's timezone (CI runs in UTC).
- **Posts missing artist/album/year** get no facet page and no link in the table.
- **Post ids must be lowercase ASCII** (`validate` enforces it): percent-encoded ids 404 on GitHub Pages.
- **Nationalities are normalized at build time** (`lib/countries.js`), not in posts.json: regions and compound values go to one country (English/Scottish → UK, Catalan → Spain). `validate` warns about unmapped values; countries too small for the 110m map (Gibraltar, Feroe, Cabo Verde) are drawn as dots.
- **The full table lives at `/archive/all/`**, `/archive/` is the stats landing: it forwards old `/archive/?q=…` search links to the table.
- **Redirects are a frozen JSON**, not computed from posts: old URLs must keep working even when data changes.
- **Radio mode swaps the post in place** (js/radio.js): a page load would stop the music. The live YouTube and Spotify panels must never move in the DOM (iframes reload when moved); YouTube embeds carry `enablejsapi=1`. Posts without YouTube play Spotify (30 s previews without a Spotify session); dSong's broken playlists are left out.
- **Media fields** in `metadata`: `youtube_code`, `spotify_url`, `apple_music_url` (embed URL; `?i=` = song, otherwise album), `podcast_file`. Broken embeds are removed from the data (history keeps them); Apple Music URLs were matched via the iTunes Search API.
- **dSong's own Spotify playlists are kept even though they're broken** (`user/dsong2009`, `user/skuark`, `user/jesusr`: 18 posts). `check-media` reports them; don't remove them.
- **`reviewed_at`** (post level, `yyyy-mm-dd`): set by `npm run edit` when a post has been reviewed by hand; not shown on the site.
- **MusicBrainz is the identity base for metadata enrichment**: artists are matched to an MBID (`data/musicbrainz.json`, outside posts.json so the original data stays untouched); later steps (Wikidata for country/genre/official site, ISRC for cross-platform players) hang off that id. Artist pages link to MusicBrainz.
- **Rewriting posts.json from a script**: `JSON.stringify(data, null, 2) + "\n"`, escaping U+007F–U+009F as `\uXXXX`, keeps the file byte-identical.
- Refactors are verified by building before/after and running `diff -rq` on `_site`.
