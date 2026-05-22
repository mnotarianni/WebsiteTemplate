# Onboarding a New Client to the Google Reviews Feed

This is the step-by-step process for adding a new client site to the existing Google Reviews infrastructure. Everything (Google Cloud project, API key, Cloudflare Worker, KV cache) is already set up — you're just adding a new entry to the system.

**Estimated time per client: 10–15 minutes**

---

## Prerequisites

Before starting, make sure you have:

- [ ] The client's **business name** (as it appears on Google)
- [ ] The client's **website domain** (e.g., `https://acmeplumbing.com`)
- [ ] Access to the client's **Hostinger site** (or whoever manages it)
- [ ] Login access to your **Google Cloud Console** and **Cloudflare dashboard**

---

## Step 1: Find the client's Google Place ID

1. Go to [Google's Place ID Finder](https://developers.google.com/maps/documentation/places/web-service/place-id)
2. In the map search box, type the client's business name and location (e.g., `Acme Plumbing Orlando FL`)
3. Click the correct result on the map
4. Copy the **Place ID** that appears in the info window — it looks like `ChIJN1t_tDeuEmsRUsoyG83frY4`

**Save this somewhere temporarily** — you'll paste it into the Worker in a moment.

**Sanity check:** Verify it's the right business by clicking the "View on Google Maps" link. Confirm the location, business name, and that there are visible reviews on their Google profile.

---

## Step 2: Pick a client slug

A slug is a short, URL-safe identifier you'll use in the code. Use lowercase, hyphens, no spaces.

Examples:
- `acme-plumbing`
- `joes-cafe`
- `smith-dental`

Keep it consistent — this is what gets passed in the URL: `?client=acme-plumbing`

---

## Step 3: Update the Cloudflare Worker

1. Log into [dash.cloudflare.com](https://dash.cloudflare.com)
2. Go to **Workers & Pages** → click the `client-reviews` Worker
3. Click **Edit code**

### 3a. Add the client to the `CLIENTS` object

Find this block near the top of the file:

```javascript
const CLIENTS = {
  'acme-plumbing': 'ChIJN1t_tDeuEmsRUsoyG83frY4',
  'joes-cafe': 'ChIJrTLr-GyuEmsRBfy61i59si0',
  // ...
};
```

Add a new line with the client's slug and Place ID:

```javascript
const CLIENTS = {
  'acme-plumbing': 'ChIJN1t_tDeuEmsRUsoyG83frY4',
  'joes-cafe': 'ChIJrTLr-GyuEmsRBfy61i59si0',
  'new-client-slug': 'NEW_PLACE_ID_HERE',  // ← add this
};
```

### 3b. Add their domain(s) to `ALLOWED_ORIGINS`

Find this block:

```javascript
const ALLOWED_ORIGINS = [
  'https://acmeplumbing.com',
  'https://www.acmeplumbing.com',
  // ...
];
```

Add **both** the `www` and non-`www` versions of the client's domain:

```javascript
const ALLOWED_ORIGINS = [
  'https://acmeplumbing.com',
  'https://www.acmeplumbing.com',
  'https://newclient.com',           // ← add this
  'https://www.newclient.com',       // ← and this
];
```

> ⚠️ If the client uses a custom subdomain (e.g., `reviews.client.com`), add that too.

### 3c. Deploy

Click **Save and Deploy** in the top-right.

---

## Step 4: Test the Worker endpoint

Before touching the client's site, verify the Worker returns data for the new client.

Open this URL in a browser (replace with your actual Worker URL and client slug):

```
https://client-reviews.riannitech.workers.dev/?client=new-client-slug
```

**You should see JSON output** containing:
- `name`: business name
- `rating`: average rating
- `totalReviews`: total review count
- `reviews`: array of up to 5 reviews

**If you see an error:**
- `"Unknown client"` → slug doesn't match what's in the `CLIENTS` object (check spelling)
- `"Upstream error"` → Place ID may be wrong, or there's an API issue (check Worker logs)
- Empty reviews array → the business genuinely has no Google reviews yet

Refresh the page a second time — you should see `"cached": true` in the response. That confirms KV caching is working.

---

## Step 5: Add the embed code to the client's Hostinger site

1. Log into Hostinger and open the client's site editor (or file manager if it's raw HTML)
2. Open the page where reviews should appear
3. Paste the snippet below into the HTML, where you want the reviews to render

```html
<div id="google-reviews" class="reviews-container">
  <p>Loading reviews...</p>
</div>

<style>
  .reviews-container {
    max-width: 1200px;
    margin: 2rem auto;
    font-family: system-ui, -apple-system, sans-serif;
  }
  .reviews-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  .reviews-rating {
    font-size: 2rem;
    font-weight: bold;
  }
  .reviews-stars { color: #fbbc04; font-size: 1.25rem; }
  .reviews-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1rem;
  }
  .review-card {
    background: #fff;
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 1.25rem;
  }
  .review-author {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }
  .review-author img {
    width: 40px; height: 40px; border-radius: 50%;
  }
  .review-text {
    color: #444;
    line-height: 1.5;
    font-size: 0.95rem;
  }
  .review-time {
    color: #777;
    font-size: 0.85rem;
    margin-top: 0.5rem;
  }
</style>

<script>
(async function() {
  const WORKER_URL = 'https://client-reviews.riannitech.workers.dev';
  const CLIENT_SLUG = 'new-client-slug';  // ← CHANGE THIS PER CLIENT

  const container = document.getElementById('google-reviews');

  try {
    const res = await fetch(`${WORKER_URL}/?client=${CLIENT_SLUG}`);
    const data = await res.json();

    if (!data.reviews || data.reviews.length === 0) {
      container.innerHTML = '<p>No reviews available.</p>';
      return;
    }

    const stars = '★'.repeat(Math.round(data.rating)) + '☆'.repeat(5 - Math.round(data.rating));

    container.innerHTML = `
      <div class="reviews-header">
        <div>
          <div class="reviews-rating">${data.rating.toFixed(1)}</div>
          <div class="reviews-stars">${stars}</div>
          <div>${data.totalReviews} Google reviews</div>
        </div>
      </div>
      <div class="reviews-grid">
        ${data.reviews.map(r => `
          <div class="review-card">
            <div class="review-author">
              ${r.authorPhoto ? `<img src="${r.authorPhoto}" alt="${escapeHtml(r.author)}">` : ''}
              <div>
                <div><strong>${escapeHtml(r.author)}</strong></div>
                <div class="reviews-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
              </div>
            </div>
            <div class="review-text">${escapeHtml(r.text)}</div>
            <div class="review-time">${escapeHtml(r.relativeTime)}</div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    container.innerHTML = '<p>Unable to load reviews.</p>';
    console.error(err);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
})();
</script>
```

**Two things to change in the snippet:**
1. `WORKER_URL` → your actual Worker URL (only needed if you forget to pre-fill the template)
2. `CLIENT_SLUG` → the new client's slug from Step 2

---

## Step 6: Customize styling to match the client's brand (optional)

The default styling is clean but generic. To match the client's site:

- **Match font**: change `font-family` in `.reviews-container` to match their site's font
- **Match colors**: update `border`, `background`, and text colors in `.review-card`
- **Adjust spacing**: tweak `padding`, `margin`, `gap` to match the surrounding site

If you have a CSS framework on the client's site (Bootstrap, Tailwind, etc.), you can strip out the `<style>` block and use their classes instead.

---

## Step 7: Verify it works on the live site

1. Visit the live client page in an **incognito window** (avoids cached versions)
2. Open **DevTools → Network tab** → reload the page
3. Find the request to your Worker URL
   - Status should be **200**
   - Response should contain the reviews JSON
4. Check **DevTools → Console** for any errors
5. Visually confirm reviews are displaying correctly

**Common issues:**

| Problem | Cause | Fix |
|---|---|---|
| CORS error in console | Domain not in `ALLOWED_ORIGINS` | Add it in Step 3b, redeploy |
| "Unknown client" in response | Slug mismatch | Check spelling in script vs. Worker |
| Blank reviews / no error | Business has no Google reviews yet | Wait for client to get reviews |
| Old reviews showing | KV cache still warm (24h TTL) | Wait, or manually purge KV key |

---

## Step 8: Final checks

- [ ] Reviews display correctly on desktop
- [ ] Reviews display correctly on mobile (test responsive layout)
- [ ] No console errors
- [ ] Worker request returns 200 in Network tab
- [ ] Second page load shows `cached: true` in response (caching is working)
- [ ] Letting the client know the 5-review limit is a Google API restriction (not something you can change)

---

## Reference info

### Infrastructure (already set up — don't change unless needed)

- **Google Cloud project**: `client-google-reviews` (or whatever yours is named)
- **API enabled**: Places API (New)
- **API key**: stored as `GOOGLE_API_KEY` secret in the Cloudflare Worker
- **Quota cap**: 100 `GetPlaceRequest` calls per day (safety net)
- **Cloudflare Worker**: `client-reviews`
- **KV namespace**: `REVIEWS_CACHE`
- **Cache TTL**: 24 hours
- **Worker URL**: `https://client-reviews.riannitech.workers.dev`

### Cost expectations per new client

- Normal usage: ~1 API call per day (cached for 24h)
- Cost per client per month: ~$0.50 worst case, $0 with Google's free credit
- Adding clients does NOT meaningfully increase costs

### When to NOT use this onboarding doc

- **First-time setup of the whole system** → use the original full setup guide instead
- **Migrating a client to their own Google Cloud account** → separate process; copy their Place ID and API key over, but otherwise standalone

---

## Quick checklist (for repeat use)

```
[ ] Get Place ID from Place ID Finder
[ ] Pick a slug
[ ] Add slug + Place ID to Worker's CLIENTS object
[ ] Add client domain(s) to Worker's ALLOWED_ORIGINS
[ ] Save and Deploy Worker
[ ] Test Worker URL directly in browser
[ ] Paste embed snippet into Hostinger site
[ ] Update CLIENT_SLUG in the snippet
[ ] (Optional) Style to match client brand
[ ] Test live page in incognito + DevTools
[ ] Confirm cache is working on second load
[ ] Tell client about 5-review API limit
```