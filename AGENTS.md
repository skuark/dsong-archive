# AGENTS.md

Static archive of the dSong music blog (2009–2017), built with Eleventy 3 + Nunjucks and deployed to GitHub Pages (`dsong.es`). `CLAUDE.md` is a symlink to this file: keep it updated on structural changes.

## Commands

| Command | What it does |
|---|---|
| `npm run serve` | Dev server with reload (`http://localhost:8080`) |
| `npm run build` | Build to `_site/` (`ELEVENTY_ENV=production` enables analytics) |
| `npm run validate` | Validate `data/posts.json` (errors fail, warnings inform) |
| `npm run check-links` | Check internal links in `_site/` (run after build; `node scripts/check-links.mjs <dir>` for another output dir) |
| `npm run check-media [report.json]` | Check YouTube/Spotify embeds still exist (slow, external; run by hand, not in CI) |
| `npm run find-youtube [-- --apply]` | Find YouTube videos for posts without one via yt-dlp (no API key) into `reports/youtube-candidates.json`; review, then `--apply` |
| `npm run edit` | Local editor (`http://localhost:8082`, 127.0.0.1 only) for text, metadata, players and comments; validates and writes `data/posts.json` byte-identically. The form edits `editorMetadata` only; under each field it shows a green label when our value is MusicBrainz's (otherwise a button copies MusicBrainz's value into the field), what the site shows when it differs and from which source (MusicBrainz, yt-dlp…), with buttons to hide a shown player or show a hidden one (saved at once; filter "La web muestra otro dato"). ↑/↓ or k/j move between posts (⌥↑/⌥↓ inside a field). Changing a post's artist moves its MusicBrainz link to the new name and redirects the artist and album pages it leaves (lib/rename-artists.js), and is refused when the new name is another MusicBrainz artist's. The slug (post id) is editable: the old URL redirects to the new one, redirects to the old one are retargeted (no chains), and data/post-context.json, `preferEditor` and the reports keyed by id follow; each post lists the URLs that redirect to it, and "Redirecciones…" lists them all. Shows what the post presents (post-context), its MusicBrainz match (filters: artist/song to review, linked without a date, text ≠ metadata, other version, flagged player) and searches MusicBrainz, YouTube (yt-dlp) and Apple Music (iTunes) in place; MusicBrainz choices are saved at once to `data/musicbrainz.json` and the review decisions (`scripts/edit-sources.mjs`) |
| `npm run find-spotify [-- --apply]` | Find Spotify tracks/albums for posts without one via the Web API (`.env`: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`; app owner needs Premium): by MusicBrainz ISRC first, then performer + title, with the post's version; into `reports/spotify-candidates.json`, `--apply` writes `auto`/`ok` picks (`reports/spotify-review.json` wins). Never touches existing players |
| `npm run review-youtube` | Local UI (`http://localhost:8081`) to review those candidates; decisions go to `reports/youtube-review.json` and win on `--apply` |
| `npm run match-musicbrainz [-- --recheck\|--apply]` | Phase 1: match each artist to a MusicBrainz artist (MBID; no key, 1 req/s, ~2 h) into `reports/musicbrainz-candidates.json`, confirmed by its songs/albums; `--recheck` retries unconfirmed ones by artist id; `--split` matches each artist of a collaboration ("Enrique Morente y Lagartija Nick") apart; `--resolve` settles the rest without a human (typos, the only namesake, country, the posts' years, discography size, film titles → the soundtrack's composer) or marks them `notfound`; only "Varios"/"Desconocido" stay to review; `--apply` writes `data/musicbrainz.json` (`artists`) |
| `npm run match-musicbrainz-posts [-- --apply]` | Phase 2 (after phase 1 `--apply`): recording + release group of each post, searched inside its artist, into `reports/musicbrainz-posts-candidates.json`; `--resolve` settles the rest (best candidate in the post's version, the album the post or its text names, the song's first release around the post's year and never a later reissue/compilation, the album alone when the version isn't there, covers inside the performer) or marks them `notfound`; `--apply` writes each post's `musicbrainzMetadata` in posts.json (recording, song, release_group, album, isrcs, first_release) |
| `npm run review-musicbrainz` | Older local UI (`http://localhost:8083`; the editor does the same with the post's context) to review both phases (tabs Artistas / Canciones); decisions go to `reports/musicbrainz-review.json` / `reports/musicbrainz-posts-review.json` and win on `--apply` |
| `npm run audit-players` | Report (`reports/players-audit.md`) of YouTube/Spotify/Apple Music players that don't match what the post says it presents (performer, cover, live/acoustic/remix vs studio); no keys, cached in `reports/players-cache.json` |
| `npm run fix-players -- --candidates\|--apply` | Alternatives for the players flagged by audit-players (YouTube via yt-dlp, Apple Music via iTunes Search) into `reports/players-fix-candidates.json`; `--apply` applies `reports/players-fix-decisions.json` (keep/replace/remove) to `ytdlpMetadata` (YouTube) / `itunesMetadata` (Apple Music) / `hiddenPlayers` |
| `npm run musicbrainz-artists` | Fetch each linked artist's MusicBrainz record (name, aliases, country, genres, official site) into `reports/musicbrainz-artists.json` (cache, ~25 min); copies what the site uses (country, genres, official site) to `data/musicbrainz.json` `artistInfo`, plus the name (and, where ours differs, the aliases) the editor compares the artist with |
| `npm run artist-bios` | Short bio and photo of each linked artist for its page (after `musicbrainz-artists`): its Wikidata link → the Spanish (or else English) Wikipedia intro's first paragraph, and the Wikidata image (P18, Commons), into `data/artist-bios.json` (~5 min, no key; Wikimedia throttles anonymous User-Agents, so the script sends the site's URL) |
| `node scripts/rename-artists.mjs renames.json` | Rename artists in posts.json (`[{ from, to, mbid?, posts? }]`; `posts` splits one name into two artists): moves the MusicBrainz link and the review decision, and adds redirects from the old artist and album pages |
| `node scripts/redirect-moved.mjs <old _site>` | After a data change that moves facet pages (album/artist renamed, MusicBrainz titles): redirects each page of the previous build that's gone to the current page listing most of its posts, and retargets earlier redirects whose target is gone. Build the previous version clean first |
| `npm run musicbrainz-players [-- --check\|--apply]` | YouTube, Spotify and Apple Music links that MusicBrainz attaches to each post's recording (song posts) or album releases (album posts), into `reports/musicbrainz-urls.json` (1 req/s, ~30 min, resumable); `--check` tests each link (YouTube/Spotify oEmbed, iTunes lookup; no keys) and places Apple Music songs in their album embed; `--apply` writes the working ones to `musicbrainzMetadata`. Run again after phase 2 changes matches |
| `npm run musicbrainz-diffs` | Report (`reports/musicbrainz-diffs.md`) of what differs between posts.json and MusicBrainz, for data cleanup: years, song/album titles and, with `musicbrainz-artists`, artist names, nationalities, websites and genre suggestions |
| `npm run refresh-musicbrainz` | Refresh what MusicBrainz says about what's already matched (~1 h): `musicbrainz-artists --refresh`, then `musicbrainz-players` (previous cache kept as `.prev`), `--check`, `--apply`, `musicbrainz-diffs`, `redirect-moved` against the build from before, validate and check-links. Matching again (phases 1 and 2) is by hand: move their candidates file aside and rerun them; review decisions win on `--apply` |

CI (`.github/workflows/deploy-to-ghpages.yml`): `npm ci` → validate → build → check-links → deploy (only from `main`). Node version comes from `.nvmrc`.

## Structure

```
data/posts.json        Source data (~1,900 posts). Not in _data on purpose (see below). Each post keeps its sources apart:
                       `editorMetadata` (the original export of dSong, ccb8fe23d, plus hand corrections only: artist
                       names, guest readers, players chosen by hand), `hiddenPlayers` (values never to show: { field: { value:
                       broken|mismatch|hand } }), `musicbrainzMetadata` (automatic: recording, song, release_group, album,
                       isrcs, first_release and the players MusicBrainz links), `spotifyMetadata` (find-spotify),
                       `ytdlpMetadata` (YouTube videos found by searching) and `itunesMetadata` (Apple Music found in iTunes Search, last resort). The site's `metadata` is resolved from them (lib/metadata.js).
data/artist-bios.json  MBID -> { bio, lang, wikipedia, image? { src, width, height, page, author, license } } (artist-bios.mjs), shown on artist pages (pages/archive/artist.njk; artists linked one to one only).
data/podcast-sizes.json Byte size of each podcast mp3 (RSS <enclosure> needs it).
data/musicbrainz.json  { artists: name (as in posts.json) -> MBID, or [{ name, mbid }] for a collaboration ("X y Y"; mbid null: that artist isn't in MusicBrainz),
                         artistInfo: MBID -> { name, aliases? (only where our name isn't MusicBrainz's), country, genres, url }, preferEditor: { field: [MBID…] } (lib/metadata.js) }.
data/post-context.json What each post says it presents, read from its text by an LLM (Haiku): subject, performer, version
                       (original/live/acoustic/remix/cover…), cover of whom, album/year named, conflicts with metadata.
data/redirects.json    Frozen list of old URL -> new URL (meta refresh pages via pages/redirect.njk).
lib/posts.js           Loads posts once, adds `post.slugs`, exports `posts`, `groupBy`, `slugify`.
lib/musicbrainz.js     MusicBrainz client for the scripts: norm(), rate-limited search/get (1 req/s, retries 503), data file I/O.
lib/reports.js         report(name): path in reports/, where every script writes its generated files (candidates,
                       review decisions, caches, reports); reports/ is the only generated folder ignored by git.
lib/specials.js        "Especiales" (title starts with "Especial"): `specialOf(post)` -> { type: album|festival|lista, label, title, by?, series? }
                       (`post.special`, lib/posts.js): heading, black tag and breadcrumbs in pages/post.njk, series box, /archive/especiales/.
lib/versions.js        Version markers (live, acoustic, remix…) in titles: KIND, isVersion(), kindsIn().
lib/genres.js          metadata.genre (free-text values) -> broad family (Rock, Indie y alternativo…), for the archive landing (/archive/).
lib/countries.js       artist_nationality (free text, EN/ES) -> country { code (ISO numeric), name (Spanish) }.
_data/archive.js       Global `archive`: ids + byEditor/byArtist/byAlbum/byYear/byCategory/byCountry + byDay ("MM-DD") + radio.
_data/worldMap.js      Global `worldMap`: country SVG paths (visionscarto-world-atlas 110m, d3-geo) + post counts, for /mapa/.
_data/stats.js         Global `stats`: totals, rankings, decades and decade x year heatmap for the archive landing (/archive/).
_data/site.js          Global `site`: url, title, description, umamiId.
_data/redirects.js     Exposes data/redirects.json as `redirects`.
lib/facts.js           A post's "Ficha" (pages/post.njk: a section in the post's side column, under the players, sticky in the desktop split view by the page's room, `@container app`; after the text on narrow screens), Música and dSong groups of rows of label + values linked to the archive and their sources (MusicBrainz, artist site, players); `post.facts` (lib/posts.js).
lib/metadata.js        Resolves a post's `metadata` (used by lib/posts.js) from editorMetadata + MusicBrainz, one rule per field.
lib/rename-artists.js  Renames an artist (scripts/rename-artists.mjs, the editor): MusicBrainz link, review decision, redirects.
lib/validate-post.js   Per-post rules + byte-identical posts.json writer (validate-data and the editor).
lib/fonts.js           Self-hosted @fontsource fonts: used weights/subsets only (pages/feeds/fonts.11ty.js -> /css/fonts.css).
js/                    archive-table-sort.js (also: a click on a row outside its links opens the post),
                       archive-table-search.js (accent-insensitive filter, ?q=; publication-year select, ?year=),
                       players.js (post players as tabs in a box; lazy-loads via data-src),
                       podcasts.js (podcast page: copy the feed URL, play an episode in place with one <audio>, radio mode (episodes one
                       after another in the page's order, with the radio bar on top), newest/oldest order),
                       menu.js (header menu folded behind a "Menú" button on phones and small tablets),
                       on-this-day.js (home "Tal día como hoy": fetches today's JSON in the browser: posts of the day and anniversaries),
                       radio.js (radio mode: swaps posts in place keeping the live YouTube/Spotify players, their iframe APIs).
.eleventy.js           Filters (formatDate, markdown, excerpt), `posts` collection, passthrough.
pages/                 Templates (permalinks set in each): index, 404, map, rand, radio-start, post, redirect;
  archive/             the archive: archive (landing), all, podcasts, <facet> pages and their indexes (artists, editors);
  feeds/               non-HTML outputs: sitemap, robots, podcast-feed (RSS), radio and on-this-day (JSON), fonts.11ty.js (CSS).
_includes/layouts/     main.njk (head, SEO meta, header).
_includes/partials/    archive-table.njk (sortable table, js/archive-table-sort.js).
scripts/               validate-data.mjs, musicbrainz-players.mjs, check-links.mjs, check-media.mjs, find-youtube.mjs, find-spotify.mjs, review-youtube.mjs (+ .html),
                       match-musicbrainz.mjs, match-musicbrainz-posts.mjs, review-musicbrainz.mjs (+ .html), musicbrainz-artists.mjs, musicbrainz-diffs.mjs, audit-players.mjs, fix-players.mjs,
                       rename-artists.mjs, redirect-moved.mjs, refresh-musicbrainz.mjs, podcast-sizes.mjs (mp3 sizes -> data/podcast-sizes.json, for the feed; run by hand),
                       edit-posts.mjs (+ .html, local editor; edit-sources.mjs: its context, MusicBrainz and player searches).
```

## Generated pages

| Template | Data | URL |
|---|---|---|
| `pages/post.njk` | `collections.posts` | `/archive/<id>.html` |
| `pages/archive/<facet>.njk` | `archive.by<Facet>` (`{ name, slug, posts }`) | `/archive/<facets>/<slug>.html` |
| `pages/archive/editors.njk`, `pages/archive/artists.njk` | `archive.byEditor`, `stats.artistGroups` | `/archive/editors/`, `/archive/artists/` (indexes: searchable cards with name + count and tabs between the two, partials/facet-index.njk; artist cards show their Commons photo, `archive.artistImages`, author cards their Gravatar, `archive.editorImages`, over a square with up to three initials (`archive.editorInitials`, shown when there's none; artist cards too, `archive.artistInitials`), lazy-loaded) |
| `pages/archive/podcasts.njk` | `archive.podcastPosts` | `/archive/podcasts/` (cover, RSS subscribe, searchable list of the episodes) |
| `pages/archive/specials.njk` | `archive.specials` | `/archive/especiales/` (the especiales as cards, by shape: álbumes, festivales, listas y temas) |
| `pages/proyecto.njk` | — | `/el-proyecto/` (the project's history by year, static HTML written by hand: "del archivo" milestones link a post, "contado" ones are told; team and readers from 5.dsong.es; in the header menu and the footer) |
| `pages/archive/all.njk` | `collections.posts` | `/archive/all/` (the full table) |
| `pages/archive/archive.njk` | `stats` | `/archive/` (landing: search form + "dSong en cifras", static HTML/CSS charts, top 10s with a "Ver más" <details>) |
| `pages/map.njk` | `worldMap`, `archive.byCountry` | `/mapa/` (static SVG world map by artist nationality) |
| `pages/rand.njk` | `archive.ids` | `/rand/` (redirects to a random post) |
| `pages/feeds/radio.njk` | `archive.radio` | `/radio.json` (posts with YouTube, or else a playable Spotify embed, for radio mode) |
| `pages/feeds/podcast-feed.njk` | `archive.podcast` | `/podcast.xml` (RSS + iTunes tags for the 335 UniRadio podcasts) |
| `pages/feeds/on-this-day.njk` | `archive.byDay` | `/tal-dia-como-hoy/<MM-DD>.json` (`{ posts, anniversaries }`: posts published that day; albums first released that day by MusicBrainz `first_release`, only when it's the year the site shows and not a bare 1 January; only days with either) |
| `pages/redirect.njk` | `redirects` | each old URL (meta refresh + canonical) |
| `pages/404.njk` | — | `/404.html` (served by GitHub Pages) |

## Decisions (don't undo without a reason)

- **posts.json lives in `data/`, not `_data/`**: avoids an automatic global `posts` that clashes with `{% set posts %}` in templates; it's read in `lib/posts.js` (`loadPosts()`, with fs and re-parsed only when the file changes, so `npm run serve` rebuilds on edits; `_data/archive.js` is a function for the same reason).
- **Slugs are precomputed and memoized** in `lib/posts.js` (slugify costs ~0.3 ms/call).
- **`@sindresorhus/slugify` pinned to v2** (same as Eleventy's filter). v4 changes some slugs and would break URLs; Dependabot ignores its majors.
- **`formatDate` parses the string, not `Date`**: shows the original local time and doesn't depend on the build machine's timezone (CI runs in UTC).
- **Posts missing artist/album/year** get no facet page and no link in the table.
- **Post ids must be lowercase ASCII** (`validate` enforces it): percent-encoded ids 404 on GitHub Pages.
- **Nationalities are normalized at build time** (`lib/countries.js`), not in posts.json: regions and compound values go to one country (English/Scottish → UK, Catalan → Spain). `validate` warns about unmapped values; countries too small for the 110m map (Gibraltar, Feroe, Cabo Verde) are drawn as dots.
- **Archive tables are cards below 72rem** (css/bundle.css, no markup change): title, then artist · album · year, then date · category · author; the header becomes sort chips. The page is up to 90rem wide.
- **El proyecto is static HTML** (pages/proyecto.njk), not generated: easier to edit by hand. Its team (19) and readers (31) come from 5.dsong.es (May 2014; its "José Alberto Arias" link to alberto-escabias-shone is wrong: José Alberto is Brian Edward Hyde, a reader is Alberto Escabias); posts.json's `lector` field misses many readers. The "Contado" milestones retell the news posts of the original WordPress (categories Noticias, Jaén; a local MySQL import of its dump).
- **The full table lives at `/archive/all/`**, `/archive/` is the stats landing: it forwards old `/archive/?q=…` search links to the table.
- **Design ("Propuesta A · Fanzine diario")**: the author's text leads; players, Ficha and covers go beside it, smaller (2px borders, no big shadows on media). Ink on paper, yellow only for highlights, the current state and one main action per screen; 3px rules and solid offset shadows on navigation and cards; Amaranth for titles and figures, Titillium Web for text, uppercase 12px labels; no emoji, inline stroke SVG icons. Tokens on `:root` in css/bundle.css.
- **Redirects are a frozen JSON**, not computed from posts: old URLs must keep working even when data changes (`redirect-moved.mjs` adds the ones a change needs).
- **Radio mode swaps the post in place** (js/radio.js): a page load would stop the music. Its bar is the first thing in <body>, sticky on top (its height in `--radio-bar`, for the sticky side column), and "Radio" is the current item of the header menu while it plays. Breadcrumbs (with the post's Nº), header, text, festival series and Ficha (last in the side column, in that order) and comments are swapped; the bar picks "En orden / Al azar" and the players' foot says "Sonando en modo radio" while it plays; the live YouTube and Spotify panels must never move in the DOM (iframes reload when moved); YouTube embeds carry `enablejsapi=1`. Posts without YouTube play Spotify (30 s previews without a Spotify session); dSong's broken playlists are left out.
- **Media fields**: `youtube_code` (shown as the 11-character id: `youtubeId` drops tails like `&feature=kp` in original values), `spotify_url` (shown as an embed URL: lib/metadata.js `spotifyEmbed` converts play./open.spotify.com links), `apple_music_url` (embed URL; `?i=` = song, otherwise album), `podcast_file`. A post shows, per player, the first value not in `hiddenPlayers` from: `editorMetadata` (the editor's), `musicbrainzMetadata` (linked by MusicBrainz to that exact recording/album: musicbrainz-players.mjs), `spotifyMetadata`, `ytdlpMetadata` (a YouTube search by artist + title), `itunesMetadata` (an iTunes search, the least reliable). The scripts only write their own layer and `hiddenPlayers` via `setPlayer`/`hidePlayer`, and read the effective players with `effective(post)`. Most YouTube players are automatic (yt-dlp). Last comes `itunesMetadata`: 1,456 Apple Music players found in iTunes Search by artist + song (not by recording), dropped once (1c68ab78c) and restored as a last resort below every other source; `audit-players` flags the wrong ones. In `npm run edit` a player typed by hand goes to `editorMetadata` (and is shown again if it was hidden).
- **Artist photos are hotlinked from Wikimedia Commons**, not stored in the repo (GitHub Pages size): only the Wikidata image (P18, always a free Commons file) is used, never Wikipedia's page image (it can be a non-free file), and its author and license are shown with a link to the file page, as Commons' reuse terms require (on the artist index's small photos, as their title). Rerun `artist-bios` now and then: Commons files can be renamed or deleted.
- **dSong's own Spotify playlists are kept even though they're broken** (`user/dsong2009`, `user/skuark`, `user/jesusr`: 18 posts). `check-media` reports them; don't remove them.
- **MusicBrainz is the identity base for metadata enrichment**: artists are matched to an MBID (`data/musicbrainz.json`, outside posts.json so the original data stays untouched); posts are matched only inside their artist (phase 2), and later steps (Wikidata for country/genre/official site, ISRC for cross-platform players) hang off those ids. Years come from the release group's first release (recording dates are unreliable: songs get re-released). MusicBrainz data never overwrites `editorMetadata`: it lives in `musicbrainzMetadata` and `data/musicbrainz.json`, and `lib/metadata.js` decides per field what the site shows (official site: always MusicBrainz when it has one; nationality: MusicBrainz (a collaboration: the country its artists share, or else the editor's if it's one of theirs, or else the first artist's), except artists in `preferEditor` whose MusicBrainz country is where they live, not where they're from; genre: the editor's, MusicBrainz only when empty; song and album: the matched recording's and album's titles when they're recognizably the editor's, otherwise a wrong match; year: the album's first release, never later than the editor's). If a rule is wrong, change the rule, not the data. What differs goes to `musicbrainz-diffs`. Artist pages link to MusicBrainz.
- **`data/post-context.json` is the reference for "which recording"**: extracted once from each post's text by a cheap LLM (2026-11, batches of ~50 posts), so it can be wrong (`confidence`); it's a hint for matching (MusicBrainz phase 2, find-youtube's live mode, audit-players), never shown on the site and never written into posts.json.
- **A player is the recording the post presents, or nothing**: the specific version (live, acoustic, the cover by X…) if it exists; otherwise the same song by the right performer; never another performer (cover bands, karaoke, the original instead of the post's cover). If none fits, the player is hidden (`hiddenPlayers`, reason mismatch). Spotify has no keyless search, so wrong Spotify embeds can only be kept or removed. A YouTube or Spotify player that still plays the right song is kept even if post-context suggests another version (the inference can be wrong and the editor chose it): only clearly wrong ones are replaced (another song, or a wrong automatic find-youtube pick).
- **Rewriting posts.json from a script**: `JSON.stringify(data, null, 2) + "\n"`, escaping U+007F–U+009F as `\uXXXX`, keeps the file byte-identical.
- Refactors are verified by building before/after and running `diff -rq` on `_site`. Eleventy never deletes stale pages from `_site`: `rm -rf _site` before a build you compare or check links on.
