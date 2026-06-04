// RianniTech SiteCheck — passive website health auditor.
// Static UI in /public; this Worker serves /api/* and runs the scans against D1.

const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; " +
    "form-action 'self'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow"
};

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const json = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { "Content-Type": "application/json" } });
const noContent = () => new Response(null, { status: 204 });
function withHeaders(resp) { const h = new Headers(resp.headers); for (const k in SECURITY_HEADERS) h.set(k, SECURITY_HEADERS[k]); return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: h }); }

const BUCKETS = new Map();
function hit(ip, limit, windowMs) { const now = Date.now(); let e = BUCKETS.get(ip); if (!e || now > e.reset) { e = { count: 0, reset: now + windowMs }; BUCKETS.set(ip, e); } e.count++; if (BUCKETS.size > 10000) { for (const [k, v] of BUCKETS) if (now > v.reset) BUCKETS.delete(k); } return e.count > limit; }
function str(v, max, label) { if (v == null) return ""; if (typeof v !== "string") throw new HttpError(400, label + " must be text"); const s = v.trim(); if (s.length > max) throw new HttpError(400, label + " is too long"); return s; }
function intId(v, label) { const n = parseInt(v, 10); if (!n || n < 1) throw new HttpError(400, "Bad " + label); return n; }
async function readBody(request) { const len = parseInt(request.headers.get("Content-Length") || "0", 10); if (len > 100000) throw new HttpError(413, "Too large"); if (!(request.headers.get("Content-Type") || "").includes("application/json")) throw new HttpError(415, "Expected JSON"); const t = await request.text(); try { return JSON.parse(t); } catch (e) { throw new HttpError(400, "Invalid JSON"); } }

// ---- optional Cloudflare Access JWT check (set ACCESS_AUD + ACCESS_TEAM_DOMAIN to enable) ----
let JWKS = { keys: null, exp: 0 };
function b64url(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); const pad = s.length % 4 ? "=".repeat(4 - s.length % 4) : ""; const bin = atob(s + pad); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
function getCookie(request, name) { const c = request.headers.get("Cookie") || ""; const m = c.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)")); return m ? m[1] : null; }
async function jwks(team) { const now = Date.now(); if (JWKS.keys && now < JWKS.exp) return JWKS.keys; const r = await fetch("https://" + team + "/cdn-cgi/access/certs"); const j = await r.json(); JWKS = { keys: j.keys || [], exp: now + 3600000 }; return JWKS.keys; }
async function accessOK(request, env) {
  const aud = env.ACCESS_AUD, team = env.ACCESS_TEAM_DOMAIN; if (!aud || !team) return true;
  const token = request.headers.get("Cf-Access-Jwt-Assertion") || getCookie(request, "CF_Authorization"); if (!token) return false;
  const p = token.split("."); if (p.length !== 3) return false;
  let head, body; try { head = JSON.parse(new TextDecoder().decode(b64url(p[0]))); body = JSON.parse(new TextDecoder().decode(b64url(p[1]))); } catch (e) { return false; }
  const auds = Array.isArray(body.aud) ? body.aud : [body.aud]; if (!auds.includes(aud)) return false;
  if (!body.exp || Math.floor(Date.now() / 1000) >= body.exp) return false;
  try { const jk = (await jwks(team)).find(k => k.kid === head.kid); if (!jk) return false; const key = await crypto.subtle.importKey("jwk", jk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]); return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(p[2]), new TextEncoder().encode(p[0] + "." + p[1])); } catch (e) { return false; }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
    if (hit(ip, 120, 60000)) return withHeaders(new Response("Too many requests", { status: 429, headers: { "Retry-After": "60" } }));
    if (!(await accessOK(request, env))) return withHeaders(json({ error: "Forbidden" }, 403));
    const m = request.method;
    if (m === "POST" || m === "DELETE") {
      const o = request.headers.get("Origin"), r = request.headers.get("Referer"); let ok = false;
      if (o) { try { ok = new URL(o).host === url.host; } catch (e) { ok = false; } } else if (r) { try { ok = new URL(r).host === url.host; } catch (e) { ok = false; } }
      if (!ok) return withHeaders(json({ error: "Cross-origin blocked" }, 403));
    }
    let resp;
    try { resp = await handle(request, env, url); }
    catch (e) { const s = e instanceof HttpError ? e.status : 500; resp = json({ error: e instanceof HttpError ? e.message : "Server error" }, s); }
    return withHeaders(resp);
  }
};

async function handle(request, env, url) {
  const method = request.method;
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const head = parts[0] || "", seg = parts[1] || "";
  if (head === "sites") {
    if (!seg && method === "GET") return json(await listSites(env));
    if (!seg && method === "POST") return json(await addSite(env, await readBody(request)));
    if (seg && parts[2] === "scans" && method === "GET") return json(await siteScans(env, seg));
    if (seg && method === "DELETE") { await env.DB.prepare("DELETE FROM sites WHERE id=?").bind(intId(seg, "id")).run(); await env.DB.prepare("DELETE FROM scans WHERE site_id=?").bind(intId(seg, "id")).run(); return noContent(); }
  }
  if (head === "scan" && method === "POST") return json(await doScan(env, await readBody(request)));
  return new Response("Not found", { status: 404 });
}

async function listSites(env) {
  const sites = (await env.DB.prepare("SELECT id, label, url FROM sites ORDER BY label COLLATE NOCASE, id").all()).results || [];
  for (const s of sites) {
    const last = await env.DB.prepare("SELECT grade, score, scanned_at FROM scans WHERE site_id=? ORDER BY id DESC LIMIT 1").bind(s.id).first();
    s.grade = last ? last.grade : null; s.score = last ? last.score : null; s.scanned_at = last ? last.scanned_at : null;
  }
  return { sites };
}
async function addSite(env, b) {
  const url = normalizeUrl(str(b.url, 300, "URL"));
  const label = str(b.label, 120, "Label") || new URL(url).hostname;
  const res = await env.DB.prepare("INSERT INTO sites (label, url) VALUES (?,?)").bind(label, url).run();
  return { id: res.meta.last_row_id, label, url };
}
async function siteScans(env, id) {
  const rows = (await env.DB.prepare("SELECT id, score, grade, scanned_at FROM scans WHERE site_id=? ORDER BY id DESC LIMIT 30").bind(intId(id, "id")).all()).results || [];
  return { scans: rows };
}
async function doScan(env, b) {
  const url = normalizeUrl(str(b.url, 300, "URL"));
  const siteId = b.siteId == null ? null : (parseInt(b.siteId, 10) || null);
  const report = await runScan(url);
  await env.DB.prepare("INSERT INTO scans (site_id, url, score, grade, results) VALUES (?,?,?,?,?)").bind(siteId, url, report.overall.score, report.overall.grade, JSON.stringify(report)).run();
  return report;
}

function normalizeUrl(raw) {
  let s = raw.trim();
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  let u; try { u = new URL(s); } catch (e) { throw new HttpError(400, "That doesn't look like a valid URL"); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new HttpError(400, "URL must be http or https");
  if (!u.hostname.includes(".")) throw new HttpError(400, "Enter a full domain (e.g. example.com)");
  return u.href;
}

// ---------------- DNS over HTTPS ----------------
async function doh(name, type) {
  try {
    const r = await fetch("https://1.1.1.1/dns-query?name=" + encodeURIComponent(name) + "&type=" + type, { headers: { accept: "application/dns-json" }, signal: AbortSignal.timeout(5000) });
    const j = await r.json();
    return (j.Answer || []).map(a => String(a.data || "").replace(/^"|"$/g, "").replace(/" "/g, ""));
  } catch (e) { return []; }
}

// ---------------- the audit ----------------
function gradeOf(score) { return score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F"; }

async function runScan(url) {
  const u = new URL(url);
  const domain = u.hostname;
  const checks = [];
  const add = (cat, label, status, detail, fix) => checks.push({ cat, label, status, detail: detail || "", fix: fix || "" });

  // --- fetch the page (follow redirects) ---
  let headers = {}, html = "", finalUrl = url, status = 0, timing = 0, fetchErr = null;
  try {
    const t0 = Date.now();
    const resp = await fetch(url, { redirect: "follow", headers: { "User-Agent": "RianniTech-SiteCheck/1.0 (+https://riannitech.com)" }, signal: AbortSignal.timeout(12000) });
    timing = Date.now() - t0; status = resp.status; finalUrl = resp.url || url;
    resp.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    if ((headers["content-type"] || "").includes("text/html")) { const buf = await resp.arrayBuffer(); html = new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, 2500000)); }
  } catch (e) { fetchErr = String((e && e.message) || e); }

  if (fetchErr) {
    add("Availability", "Site reachable", "fail", "Couldn't load the site: " + fetchErr, "Confirm the site is online and the URL/DNS is correct.");
  } else {
    add("Availability", "Site responds", status < 400 ? "pass" : "warn", "HTTP " + status + " in " + timing + " ms", status >= 400 ? "The homepage returned an error status." : "");
    const https = finalUrl.startsWith("https://");
    add("Security", "Served over HTTPS", https ? "pass" : "fail", finalUrl, https ? "" : "Serve the site over HTTPS with a valid certificate.");

    // http -> https redirect
    try {
      const httpResp = await fetch("http://" + domain, { redirect: "manual", signal: AbortSignal.timeout(6000) });
      const loc = httpResp.headers.get("location") || "";
      const redirects = (httpResp.status >= 300 && httpResp.status < 400 && loc.startsWith("https://"));
      add("Security", "HTTP redirects to HTTPS", redirects ? "pass" : "warn", redirects ? loc : "status " + httpResp.status, redirects ? "" : "Add a 301 redirect from http:// to https://.");
    } catch (e) { /* ignore */ }

    // security headers
    const h = headers;
    const csp = h["content-security-policy"];
    add("Security", "HSTS (Strict-Transport-Security)", h["strict-transport-security"] ? "pass" : "warn", h["strict-transport-security"] || "missing", h["strict-transport-security"] ? "" : "Add Strict-Transport-Security to force HTTPS.");
    add("Security", "Content-Security-Policy", csp ? "pass" : "warn", csp ? "present" : "missing", csp ? "" : "Add a CSP to limit where scripts/styles can load from.");
    const xfo = h["x-frame-options"] || (csp && /frame-ancestors/i.test(csp));
    add("Security", "Clickjacking protection", xfo ? "pass" : "warn", h["x-frame-options"] || (csp ? "via CSP frame-ancestors" : "missing"), xfo ? "" : "Add X-Frame-Options: DENY or CSP frame-ancestors.");
    add("Security", "X-Content-Type-Options", h["x-content-type-options"] === "nosniff" ? "pass" : "warn", h["x-content-type-options"] || "missing", h["x-content-type-options"] === "nosniff" ? "" : "Add X-Content-Type-Options: nosniff.");
    add("Security", "Referrer-Policy", h["referrer-policy"] ? "pass" : "warn", h["referrer-policy"] || "missing", h["referrer-policy"] ? "" : "Add a Referrer-Policy header.");
    const leak = (h["server"] && /\d/.test(h["server"])) || h["x-powered-by"];
    add("Security", "No version disclosure", leak ? "warn" : "pass", leak ? ("Server: " + (h["server"] || "") + " " + (h["x-powered-by"] || "")).trim() : "no version headers", leak ? "Hide Server/X-Powered-By version headers." : "");

    // mixed content (http resources on an https page)
    if (https && html) {
      const mixed = /(?:src|href)\s*=\s*["']http:\/\//i.test(html);
      add("Security", "No mixed content", mixed ? "fail" : "pass", mixed ? "http:// resources found on an https page" : "clean", mixed ? "Load all resources over https://." : "");
    }

    // --- SEO / HTML ---
    if (html) {
      const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
      add("SEO", "Title tag", title && title.trim() ? "pass" : "fail", title ? title.trim().slice(0, 80) : "missing", title ? "" : "Add a descriptive <title>.");
      const desc = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || [])[1];
      add("SEO", "Meta description", desc && desc.trim() ? "pass" : "warn", desc ? desc.trim().slice(0, 90) : "missing", desc ? "" : "Add a <meta name=\"description\">.");
      add("SEO", "Mobile viewport", /<meta[^>]+name=["']viewport["']/i.test(html) ? "pass" : "fail", "", /<meta[^>]+name=["']viewport["']/i.test(html) ? "" : "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">.");
      add("SEO", "Language set", /<html[^>]+lang=/i.test(html) ? "pass" : "warn", "", /<html[^>]+lang=/i.test(html) ? "" : "Add lang=\"en\" to the <html> tag.");
      add("SEO", "Canonical URL", /<link[^>]+rel=["']canonical["']/i.test(html) ? "pass" : "warn", "", /<link[^>]+rel=["']canonical["']/i.test(html) ? "" : "Add a <link rel=\"canonical\"> to avoid duplicate-URL issues.");
      const h1s = (html.match(/<h1[\s>]/gi) || []).length;
      add("SEO", "Single H1", h1s === 1 ? "pass" : "warn", h1s + " found", h1s === 1 ? "" : (h1s === 0 ? "Add one <h1> heading." : "Use exactly one <h1>."));
      add("SEO", "Social preview (Open Graph)", /<meta[^>]+property=["']og:(title|image)["']/i.test(html) ? "pass" : "warn", "", /og:/i.test(html) ? "" : "Add og:title and og:image for nicer link previews.");
      add("SEO", "Favicon", /<link[^>]+rel=["'][^"']*icon/i.test(html) ? "pass" : "warn", "", /icon/i.test(html) ? "" : "Add a favicon.");
    }

    // robots + sitemap (parallel)
    try {
      const [robots, sitemap] = await Promise.all([
        fetch(u.origin + "/robots.txt", { signal: AbortSignal.timeout(6000) }).then(r => r.ok).catch(() => false),
        fetch(u.origin + "/sitemap.xml", { signal: AbortSignal.timeout(6000) }).then(r => r.ok).catch(() => false)
      ]);
      add("SEO", "robots.txt", robots ? "pass" : "warn", robots ? "found" : "missing", robots ? "" : "Add a /robots.txt.");
      add("SEO", "sitemap.xml", sitemap ? "pass" : "warn", sitemap ? "found" : "missing", sitemap ? "" : "Add a /sitemap.xml and reference it in robots.txt.");
    } catch (e) { /* ignore */ }

    // --- performance-lite ---
    const enc = headers["content-encoding"] || "";
    add("Performance", "Compression", /gzip|br|deflate/i.test(enc) ? "pass" : "warn", enc || "none", /gzip|br/i.test(enc) ? "" : "Enable gzip/Brotli compression.");
    add("Performance", "Response time (TTFB-ish)", timing < 800 ? "pass" : timing < 2000 ? "warn" : "fail", timing + " ms", timing < 800 ? "" : "Homepage is slow to respond — check hosting/CDN.");
    add("Performance", "Caching headers", headers["cache-control"] ? "pass" : "warn", headers["cache-control"] || "missing", headers["cache-control"] ? "" : "Set Cache-Control on static assets.");
    if (html) {
      const kb = Math.round(html.length / 1024);
      const reqs = (html.match(/<(script|link|img)\b/gi) || []).length;
      add("Performance", "HTML page weight", kb < 150 ? "pass" : kb < 400 ? "warn" : "fail", kb + " KB", kb < 150 ? "" : "Large HTML — trim inline content / split the page.");
      add("Performance", "Resource references", reqs < 50 ? "pass" : reqs < 100 ? "warn" : "fail", reqs + " script/style/img tags", reqs < 50 ? "" : "Lots of resources — bundle/lazy-load where possible.");
    }
  }

  // --- DNS & email (run regardless of page fetch) ---
  try {
    const [txt, dmarc, mx, caa] = await Promise.all([doh(domain, "TXT"), doh("_dmarc." + domain, "TXT"), doh(domain, "MX"), doh(domain, "CAA")]);
    const spf = txt.find(t => /v=spf1/i.test(t));
    add("DNS & Email", "SPF record", spf ? "pass" : (mx.length ? "warn" : "pass"), spf || (mx.length ? "missing (domain sends mail)" : "n/a — no mail"), spf ? "" : (mx.length ? "Add an SPF TXT record." : ""));
    const dm = dmarc.find(t => /v=DMARC1/i.test(t));
    const policy = dm ? ((dm.match(/p=(\w+)/i) || [])[1] || "") : "";
    add("DNS & Email", "DMARC record", dm ? (policy === "none" ? "warn" : "pass") : (mx.length ? "fail" : "warn"), dm ? ("p=" + policy) : "missing", dm ? (policy === "none" ? "Move DMARC from p=none to quarantine/reject once you've confirmed mail passes." : "") : "Add a DMARC TXT record at _dmarc to stop spoofing.");
    add("DNS & Email", "Mail (MX) configured", mx.length ? "pass" : "warn", mx.length ? mx.join(", ").slice(0, 80) : "no MX", "");
    add("DNS & Email", "CAA record", caa.length ? "pass" : "warn", caa.length ? "present" : "missing", caa.length ? "" : "Add a CAA record to control which CAs can issue certs.");
  } catch (e) { /* ignore */ }

  // --- score by category ---
  const pts = s => s === "pass" ? 1 : s === "warn" ? 0.5 : 0;
  const cats = {};
  checks.forEach(c => { (cats[c.cat] = cats[c.cat] || []).push(c); });
  const categories = Object.keys(cats).map(name => {
    const list = cats[name];
    const score = Math.round((list.reduce((a, c) => a + pts(c.status), 0) / list.length) * 100);
    return { name, score, grade: gradeOf(score), checks: list };
  });
  const overallScore = categories.length ? Math.round(categories.reduce((a, c) => a + c.score, 0) / categories.length) : 0;

  return { url, finalUrl, domain, scannedAt: new Date().toISOString(), overall: { score: overallScore, grade: gradeOf(overallScore) }, categories };
}
