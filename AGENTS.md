# AGENTS.md

Static archive of the dSong music blog (2009–2017), built with Eleventy 3 + Nunjucks and deployed to GitHub Pages (`dsong.es`). `CLAUDE.md` is a symlink to this file: keep it updated on structural changes.

## Commands

| Command | What it does |
|---|---|
| `npm run serve` | Dev server with reload (`http://localhost:8080`) |
| `npm run build` | Build to `_site/` (`ELEVENTY_ENV=production` enables analytics) |
| `npm run validate` | Validate `data/posts.json` (errors fail, warnings inform) |
| `npm run check-links` | Check internal links in `_site/` (run after build) |

CI (`.github/workflows/deploy-to-ghpages.yml`): `npm ci` → validate → build → check-links → deploy (only from `main`). Node version comes from `.nvmrc`.

## Structure

```
data/posts.json        Source data (~1,900 posts). Not in _data on purpose (see below).
lib/posts.js           Loads posts once, adds `post.slugs`, exports `posts`, `groupBy`, `slugify`.
_data/archive.js       Global `archive`: ids + byEditor/byArtist/byAlbum/byYear/byCategory.
_data/site.js          Global `site`: url, title, description, umamiId.
.eleventy.js           Filters (formatDate, markdown, excerpt), `posts` collection, passthrough.
*.njk                  Pages: index, archive, post, archive-<facet>, rand, sitemap, robots.
_includes/layouts/     main.njk (head, SEO meta, header).
_includes/partials/    archive-table.njk (sortable table, js/archive-table-sort.js).
scripts/               validate-data.mjs, check-links.mjs.
```

## Generated pages

| Template | Data | URL |
|---|---|---|
| `post.njk` | `collections.posts` | `/archive/<id>.html` |
| `archive-<facet>.njk` | `archive.by<Facet>` (`{ name, slug, posts }`) | `/archive/<facets>/<slug>.html` |
| `archive.njk` | `collections.posts` | `/archive/` |
| `rand.njk` | `archive.ids` | `/rand/` (redirects to a random post) |

## Decisions (don't undo without a reason)

- **posts.json lives in `data/`, not `_data/`**: avoids an automatic global `posts` that clashes with `{% set posts %}` in templates; it's imported once in `lib/posts.js`.
- **Slugs are precomputed and memoized** in `lib/posts.js` (slugify costs ~0.3 ms/call).
- **`@sindresorhus/slugify` pinned to v2** (same as Eleventy's filter). v4 changes some slugs and would break URLs; Dependabot ignores its majors.
- **`formatDate` parses the string, not `Date`**: shows the original local time and doesn't depend on the build machine's timezone (CI runs in UTC).
- **Posts missing artist/album/year** get no facet page and no link in the table.
- **Post ids must be lowercase ASCII** (`validate` enforces it): percent-encoded ids 404 on GitHub Pages.
- Refactors are verified by building before/after and running `diff -rq` on `_site`.
