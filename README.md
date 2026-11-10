# SIGMA landing page

Static site (no build step): `index.html` + `assets/`. Dark UI with animated editor preview,
scroll reveals, tabbed product tour, OS-aware download button and copy-to-clipboard install commands.
Interactive: 3D hover tilt with glare, numbered hotspot pins with tooltips, a full-size viewer
(zoom and pan, ← → keys, Esc), and a hero cursor that follows the visitor. Respects
`prefers-reduced-motion` and touch devices.

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

## Custom domain

If you host on your own domain, update the three absolute URLs in `index.html` (`og:url`, `og:image`,
`twitter:image`, `canonical`) to that domain so social previews resolve.

## Maintenance

- Screenshots in `assets/*.webp` are 2880 × 1800 (2×) captures. Regenerate from a running stack with
  `SIGMA_SCREENSHOT_SCALE=2 SIGMA_SCREENSHOT_OUT=/some/dir pnpm screenshots` (on `main`), then convert
  to WebP (quality 90) and update the hotspot coordinates in the `shots` array in `index.html`.
- Download buttons link to `releases/latest`, so they never go stale.
- Brand rules: `brand/BRAND.md` on `main`.

Built by [atreyakamat.dev](https://atreyakamat.dev). MIT licensed.
