# El Archivo de dSong

![](images/logo.png)

[https://dsong.es/](https://dsong.es/)

Static archive of **dSong**, a non-profit music blog founded on May 18, 2009, where a group of friends shared daily music recommendations. Over 8 years, nearly 2,000 articles were published, including 335 podcast episodes in collaboration with [UniRadio Jaén](https://uniradio.ujaen.es/).

The original blog ended in early 2017. Rather than let all this content be lost on a backup drive, this project was created to preserve it in a new format—with features like filtering, sorting, and random post discovery.

## Requirements

- Node.js 18+

## Installation

```bash
npm install
```

## Development

Start the development server with hot reload:

```bash
npm run serve
```

The site will be available at `http://localhost:8080`.

## Production

Generate the static site in the `_site` folder:

```bash
npm run build
```

## Technologies

- [Eleventy](https://www.11ty.dev/) - Static site generator
- [Nunjucks](https://mozilla.github.io/nunjucks/) - Template engine
- [markdown-it](https://github.com/markdown-it/markdown-it) - Markdown parser
- [date-fns](https://date-fns.org/) - Date utilities

## License

All content is licensed under [Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Spain (CC BY-NC-SA 3.0 ES)](https://creativecommons.org/licenses/by-nc-sa/3.0/es/).
