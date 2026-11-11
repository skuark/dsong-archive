# El Archivo de dSong

![](images/logo.png)

[https://dsong.es/](https://dsong.es/)

Static archive of **dSong**, a non-profit music blog founded on May 18, 2009, where a group of friends shared daily music recommendations. Over 8 years, nearly 2,000 articles were published, including 335 podcast episodes in collaboration with [UniRadio Jaén](https://uniradio.ujaen.es/).

The original blog ended in early 2017. Rather than let all this content be lost on a backup drive, this project was created to preserve it in a new format.

## Features

- **Archive**: every post in a sortable, searchable table, with pages per artist, album, year, category, author and country.
- **Music map**: `/mapa/` shows a world map colored by the artists' nationality; click a country to see its posts.
- **Posts**: split view on desktop (text on the left, players on the right) with YouTube, Spotify and Apple Music players, and previous/next/random navigation.
- **Radio mode**: plays post after post (YouTube, or Spotify when there's no video) without reloading the page, so the text of each song is shown next to it. In chronological or random order; `/radio/` starts on a random post.
- **Podcast**: the 335 UniRadio Jaén episodes with their own player on each post, and an RSS feed (`/podcast.xml`) to subscribe from any podcast app.
- **On this day**: the home page lists the posts published on today's date in previous years.
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

- edit a post's text (with a preview), metadata, players and comments;
- filter posts, for example those missing a player or those still to review;
- mark posts as reviewed.

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

```bash
npm run find-youtube              # find YouTube videos for posts without one (yt-dlp, no API key)
npm run review-youtube            # local UI (http://localhost:8081) to review those candidates
npm run find-youtube -- --apply   # write the accepted videos into posts.json
node scripts/podcast-sizes.mjs    # refresh mp3 sizes for the podcast feed (only if podcast files change)
```

## Deployment

Pushing to `main` deploys to GitHub Pages (`.github/workflows/deploy-to-ghpages.yml`): install, validate, build, check links, deploy.

See [`AGENTS.md`](AGENTS.md) for the project structure and design decisions.

## Technologies

- [Eleventy](https://www.11ty.dev/) - Static site generator
- [Nunjucks](https://mozilla.github.io/nunjucks/) - Template engine
- [markdown-it](https://github.com/markdown-it/markdown-it) - Markdown parser
- [d3-geo](https://d3js.org/d3-geo) + [visionscarto-world-atlas](https://github.com/Fil/visionscarto-world-atlas) - World map, projected at build time

## License

All content is licensed under [Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Spain (CC BY-NC-SA 3.0 ES)](https://creativecommons.org/licenses/by-nc-sa/3.0/es/).
