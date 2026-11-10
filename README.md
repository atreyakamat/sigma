# SIGMA landing page

Static site (no build step): `index.html` + `assets/`. Dark UI with animated editor preview,
scroll reveals, tabbed product tour, OS-aware download button and copy-to-clipboard install commands.
Respects `prefers-reduced-motion`.

## Host it

**GitHub Pages:** Repository → Settings → Pages → Build and deployment → Source "Deploy from a
branch" → Branch `landing-page`, folder `/ (root)` → Save. It is then live at
`https://atreyakamat.github.io/sigma/`.

**Your own domain (e.g. atreyakamat.dev or sigma.atreyakamat.dev):** add a `CNAME` file containing
the domain, then point a DNS `CNAME` record at `atreyakamat.github.io`.

**Anywhere else (Netlify, Cloudflare Pages, Vercel):** point the project at this branch with no
build command and the root as the publish directory.

## Preview locally

```
python3 -m http.server 8080
```

## Maintenance

- Screenshots in `assets/` are copied from `docs/images/` on `main` (regenerate with `pnpm screenshots`).
- Download buttons link to `releases/latest`, so they never go stale.
- Brand rules: `brand/BRAND.md` on `main`.

Built by [atreyakamat.dev](https://atreyakamat.dev). MIT licensed.
