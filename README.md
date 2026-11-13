# El Archivo de dSong

![](images/logo.png)

[https://dsong.es/](https://dsong.es/)

Static archive of **dSong**, a non-profit music blog founded on May 18, 2009, where a group of friends shared daily music recommendations. Over 8 years, nearly 2,000 articles were published, including 335 podcast episodes in collaboration with [UniRadio Jaén](https://uniradio.ujaen.es/).

The original blog ended in early 2017. Rather than let all this content be lost on a backup drive, this project was created to preserve it in a new format.

## Features

- **Home**: the project in four figures and "Tal día como hoy": the posts published on today's date in previous years and the albums that turn years today (MusicBrainz release dates).
- **Archive**: `/archive/` shows dSong in numbers (posts per year, top authors, artists and genres, decade of the songs by year of publication) and leads to every post in a sortable, searchable table (`/archive/all/`, with each author's avatar), with pages per artist, album, year, category, author and country.
- **Authors and artists**: `/archive/editors/` and `/archive/artists/` list every author and artist as searchable cards (Gravatar or Wikimedia Commons photo, else initials). Artist pages add a short Wikipedia bio, a photo and links to MusicBrainz.
- **Especiales**: `/archive/especiales/` gathers the special posts (albums, festivals, lists) by shape.
- **Music map**: `/mapa/` shows a world map colored by the artists' nationality; click a country to see its posts.
- **Posts**: the author's text first, with the players (YouTube, Spotify, Apple Music, podcast) and a "Ficha" beside it on wide screens: everything known about the song, linked to the archive and its sources. Previous/next links in the breadcrumbs and cards at the foot (with the artist's photo), and the original blog's comments.
- **Radio mode**: plays post after post (only those with a YouTube video) without reloading the page, so the text of each song is shown next to it. The post's players box becomes the radio (sticky at the top on phones) and picks chronological or random order; `/radio/` starts on a random post.
- **Podcast**: the 335 UniRadio Jaén episodes with their own player on each post, listed at `/archive/podcasts/` (playable in place, one after another), and an RSS feed (`/podcast.xml`) to subscribe from any podcast app.
- **El proyecto**: `/el-proyecto/` tells dSong's history year by year, with its team and guest readers.
- **Random post**: `/rand/` opens a random post.

## Requirements

- Node.js 26+ (see `.nvmrc`)

## Installation

```bash
npm install
```

## Development

Start the development server with hot reload:

```bash
npm run serve
```

The site will be available at `http://localhost:8080`. It rebuilds when templates or `data/posts.json` change.

## Editing content

The content lives in `data/posts.json`. To edit it in the browser:

```bash
npm run edit
```

The editor opens at `http://localhost:8082` and only listens on your machine. You can use it to:

- edit a post's text (with a preview), slug, metadata, players and comments;
- compare each field with MusicBrainz (and copy MusicBrainz's value), see where each player comes from, hide or show players;
- filter posts, for example those missing a player or those where the site shows another value;
- see the redirects to each post and the full list.

Every save is validated and rewrites `posts.json` keeping its exact format. With `npm run serve` running, changes show up on the site right away.

## Production

Generate the static site in the `_site` folder:

```bash
npm run build
```

## Checks

```bash
npm run validate      # validate data/posts.json
npm run check-links   # check internal links in _site (run after build)
npm run check-media   # check YouTube/Spotify embeds still exist (slow, run by hand)
```

`validate` and `check-links` run in CI before deploying.

## Maintenance scripts

Players and data enrichment (each writes its own layer of `posts.json`, never the editor's data; see `AGENTS.md` for every option):

```bash
npm run find-youtube              # find YouTube videos for posts without one (yt-dlp, no API key)
npm run review-youtube            # local UI (http://localhost:8081) to review those candidates
npm run find-youtube -- --apply   # write the accepted videos into posts.json
npm run audit-players             # report players that don't match what the post presents
npm run fix-players -- --candidates   # alternatives for those, then --apply the decisions
npm run match-musicbrainz         # match artists to MusicBrainz (then match-musicbrainz-posts for songs)
npm run refresh-musicbrainz       # refresh what MusicBrainz says about the matches (~1 h)
npm run artist-bios               # Wikipedia bio and Commons photo of each linked artist
node scripts/podcast-sizes.mjs    # refresh mp3 sizes and durations for the podcast feed (only if podcast files change)
```

## Deployment

Pushing to `main` deploys to GitHub Pages (`.github/workflows/deploy-to-ghpages.yml`): install, validate, build, check links, deploy.

See [`AGENTS.md`](AGENTS.md) for the project structure and design decisions.

## Technologies

- [Eleventy](https://www.11ty.dev/) - Static site generator
- [Nunjucks](https://mozilla.github.io/nunjucks/) - Template engine
- [markdown-it](https://github.com/markdown-it/markdown-it) - Markdown parser
- [d3-geo](https://d3js.org/d3-geo) + [visionscarto-world-atlas](https://github.com/Fil/visionscarto-world-atlas) - World map, projected at build time
- [MusicBrainz](https://musicbrainz.org/), [Wikidata](https://www.wikidata.org/) and [Wikimedia Commons](https://commons.wikimedia.org/) - Song, album and artist data, bios and photos

## License

All content is licensed under [Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Spain (CC BY-NC-SA 3.0 ES)](https://creativecommons.org/licenses/by-nc-sa/3.0/es/).
