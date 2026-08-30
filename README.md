# rgitweb

A fully static, client-side Git repository browser — a cgit replacement with
no server-side rendering at all.

Point it at the URL of a Git repository hosted as static files (the dumb-HTTP
layout maintained by `git update-server-info`) and it browses branches, tags,
history, commits with diffs, trees, and files — entirely in the browser.

## How it works

The app fetches exactly what a dumb-HTTP `git clone` would read, but lazily:
small text files (`info/refs`, `HEAD`, `objects/info/packs`) whole, loose
objects individually, and pack files never in full — the `.idx` index locates
an object and an HTTP Range request fetches just that object's bytes from the
`.pack`. Packs are immutable, so the browser HTTP cache absorbs repeat reads.
Deltified objects are resolved recursively client-side.

## Hosting requirements for browsed repositories

- A bare repository served as static files, with `git update-server-info`
  run after each update (the `post-update` sample hook does this).
- CORS headers allowing the browsing origin, exposing `Accept-Ranges` and
  `Content-Range`.
- Range request support (standard on almost every static host); without it
  the app falls back to whole-file fetches.

## Development

```sh
npm install
npm run dev       # local dev server
npm test          # Jest; fixtures are built with the real git CLI
npm run lint:fix  # ESLint (includes formatting)
npm run build     # static site in dist/
```

See `AGENTS.md` for architecture notes and conventions.

## License

Apache-2.0
