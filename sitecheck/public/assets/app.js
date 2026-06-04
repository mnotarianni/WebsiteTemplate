const $ = id => document.getElementById(id);
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let _t; function toast(m) { const t = $("toast"); t.textContent = m; t.classList.add("show"); clearTimeout(_t); _t = setTimeout(() => t.classList.remove("show"), 2800); }
async function api(method, path, body) {
  const o = { method, headers: {} };
  if (body) { o.headers["Content-Type"] = "application/json"; o.body = JSON.stringify(body); }
  const r = await fetch(path, o);
  if (!r.ok) { let m = "Request failed (" + r.status + ")"; try { const j = await r.json(); if (j && j.error) m = j.error; } catch (e) {} throw new Error(m); }
  return r.status === 204 ? null : r.json();
}

let sites = [], scanning = false;

function scanAdhoc() { const url = $("scanUrl").value.trim(); if (!url) { toast("Enter a URL"); return; } runScan(url, null); }
function scanSiteById(id) { const s = sites.find(x => x.id === id); if (s) runScan(s.url, id); }

async function runScan(url, siteId) {
  if (scanning) return; scanning = true;
  $("report").innerHTML = '<div class="card"><p class="muted" style="margin:0">Scanning ' + esc(url) + ' … (a few seconds)</p></div>';
  try { const rep = await api("POST", "/api/scan", { url, siteId }); renderReport(rep); if (siteId != null) loadSites(); }
  catch (e) { $("report").innerHTML = ""; toast("Scan failed: " + e.message); }
  finally { scanning = false; }
}

function renderReport(rep) {
  const sym = s => s === "pass" ? "✓" : s === "warn" ? "!" : "✕";
  let html = '<div class="card">';
  html += '<div class="rep-head"><div class="grade g-' + rep.overall.grade + '">' + rep.overall.grade + '</div>'
    + '<div><div class="rep-url">' + esc(rep.domain) + '</div>'
    + '<div class="muted">' + esc(rep.finalUrl) + ' · ' + rep.overall.score + '/100 · ' + new Date(rep.scannedAt).toLocaleString() + '</div></div></div>';
  rep.categories.forEach(cat => {
    html += '<div class="cat"><div class="cat-head"><span class="cat-name">' + esc(cat.name) + '</span><span class="chip g-' + cat.grade + '">' + cat.grade + ' · ' + cat.score + '</span></div>';
    cat.checks.forEach(c => {
      html += '<div class="chk"><span class="st st-' + c.status + '">' + sym(c.status) + '</span><span class="chk-body">'
        + '<span class="chk-label">' + esc(c.label) + '</span>'
        + (c.detail ? '<span class="chk-detail">' + esc(c.detail) + '</span>' : '')
        + (c.status !== "pass" && c.fix ? '<span class="chk-fix">Fix: ' + esc(c.fix) + '</span>' : '')
        + '</span></div>';
    });
    html += '</div>';
  });
  html += '</div>';
  $("report").innerHTML = html;
  $("report").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadSites() { try { const d = await api("GET", "/api/sites"); renderSites(d.sites || []); } catch (e) {} }
function renderSites(list) {
  sites = list;
  const el = $("sites");
  if (!list.length) { el.innerHTML = '<p class="muted" style="margin:0">No sites yet — add one above.</p>'; return; }
  el.innerHTML = "";
  list.forEach(s => {
    const d = document.createElement("div"); d.className = "site-row";
    const g = s.grade ? '<span class="chip g-' + s.grade + '">' + s.grade + '</span>' : '<span class="chip g-none">—</span>';
    d.innerHTML = g + '<span class="site-main"><b>' + esc(s.label || s.url) + '</b> <span class="muted">' + esc(s.url) + '</span></span>'
      + '<button class="mini" onclick="scanSiteById(' + s.id + ')">Scan</button>'
      + '<button class="mini danger" onclick="delSite(' + s.id + ')">Delete</button>';
    el.appendChild(d);
  });
}
async function addSite() {
  const url = $("siteUrl").value.trim(); if (!url) { toast("Enter a URL"); return; }
  try { await api("POST", "/api/sites", { label: $("siteLabel").value.trim(), url }); $("siteLabel").value = ""; $("siteUrl").value = ""; loadSites(); toast("Site added"); }
  catch (e) { toast("Add failed: " + e.message); }
}
async function delSite(id) {
  if (!confirm("Remove this site and its scan history?")) return;
  try { await api("DELETE", "/api/sites/" + id); loadSites(); toast("Removed"); } catch (e) { toast("Delete failed: " + e.message); }
}

loadSites();
