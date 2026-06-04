# RianniTech site template

The canonical starter for a new client site. Built to be **accessible, SEO-ready,
secure, and fast** — and to score an **A on SiteCheck** out of the box. Copy this
folder to a new client repo, then rebrand.

## Architecture (this is the standard — keep every site on it)
```
index.html  about.html  services.html  contact.html  404.html
robots.txt  sitemap.xml  .htaccess
assets/
  css/styles.css      ← design system; rebrand via the variables at the top
  js/main.js          ← nav toggle, year, form honeypot (loaded with defer)
  img/                ← favicon.svg, og.jpg, photos
```

## Rebrand checklist (find & replace)
1. **`assets/css/styles.css`** → edit the `:root` variables: `--brand`, `--accent`, the two `--*-font`s.
2. **Fonts** → swap the Google Fonts `<link>` in each page's `<head>` to match.
3. **Content placeholders** (search across the repo and replace):
   - `Business Name` / `Business<span>Name</span>`
   - `Tagline goes here`, the headlines, and the body copy
   - `City, ST`, `123 Main St`, `00000`
   - `(555) 555-1234` and `tel:+15555551234`
   - `hello@example.com`
   - `https://www.example.com` → the real domain (in canonical/OG/sitemap/robots/JSON-LD)
4. **`index.html` JSON-LD** → fill in the real LocalBusiness details (type, hours, address, geo).
5. **Images** → add `assets/img/favicon.svg`, `og.jpg`, and the photos referenced; write real `alt` text.
6. **`contact.html` form** → point `action` at your form backend (Formspree, or the shared
   RianniTech form Worker).
7. **`.htaccess`** → adjust the CSP `script-src`/`style-src` to whatever the site actually loads,
   and confirm the host supports `mod_headers`/`mod_rewrite` (most do).

## Why these defaults
Every item maps to a SiteCheck category: security headers + HTTPS (.htaccess), SEO
(title/description/canonical/OG/JSON-LD/sitemap/robots/404), accessibility (skip link,
alt text, labeled form, zoom allowed), performance (deferred JS, compression, caching,
preconnect). Start here and the audit stays green.
