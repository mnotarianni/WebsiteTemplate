# RianniTech SiteCheck

Passive website health auditor — point it at the sites you build and get a graded
report card: **Security, HTTPS, SEO, Performance, DNS & Email** — with the specific fix
for each finding. Cloudflare Worker + static assets + D1. Lives at `sitecheck.riannitech.com`.

It only does **passive** checks (reads public pages, headers, and DNS) — no active
scanning/exploitation. Use it on sites you build or manage.

## Structure
```
sitecheck/
  src/index.js      the Worker: serves /api/* + the audit engine
  public/           the UI (index.html + assets/)
  schema.sql        sites + scans tables
  wrangler.toml     name, assets dir, D1 binding
```

## Setup (Cloudflare dashboard)
1. **D1:** create a database `sitecheck` → Console → run `schema.sql` → copy its **Database ID** into `wrangler.toml`.
2. **Worker:** Workers & Pages → Create → import this GitHub repo (Workers Builds).
   - **Root directory:** `sitecheck`  ← important, since it's a subfolder of WebsiteTemplate.
   - It deploys with `npx wrangler deploy`.
3. **Custom domain:** add `sitecheck.riannitech.com` to the Worker.
4. **Access:** put `sitecheck.riannitech.com` behind Cloudflare Access (your email).
5. **(Optional, recommended) defense-in-depth:** add Worker Variables `ACCESS_TEAM_DOMAIN`
   (e.g. `riannitech.cloudflareaccess.com`) and `ACCESS_AUD` (the Access app's AUD tag) to make
   the Worker verify the Access token itself.

## Roadmap
- **Phase 1 (this):** passive audit + saved sites + history.
- **Phase 2:** Cloudflare Browser Rendering for real Lighthouse / Core Web Vitals + screenshots.
- **Phase 3:** scheduled scans + alerts (cert expiry, site down, DMARC missing).
