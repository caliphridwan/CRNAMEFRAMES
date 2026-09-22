# CR-Frames — Name Frame Ordering App

A full-stack e-commerce app for Caliph Ridwan Frames: customers search or
type a name, see it previewed in the frame style, add it to a cart at
₦20,000 per name, check out, and pay online.

```
crframes/
├── render.yaml            ← Render Blueprint (one-service deploy config)
├── frontend/
│   └── index.html        ← single-page storefront (no build step)
└── backend/
    ├── server.js          ← Express API
    ├── admin/
    │   └── index.html      ← admin dashboard (protected, see below)
    ├── src/
    │   ├── db.js            ← JSON-file order store
    │   ├── names-data.js    ← name + meaning library
    │   ├── notify.js        ← email notifications (order placed/paid)
    │   ├── order-format.js  ← shared plain-text order summary
    │   ├── admin-auth.js    ← HTTP Basic Auth for /admin
    │   └── routes/
    │       ├── names.js
    │       ├── orders.js
    │       ├── payments.js  ← Paystack integration + dev mock mode
    │       └── admin.js     ← list orders, update status
    ├── data/db.json         ← orders are persisted here
    ├── package.json
    └── .env.example
```

## How it fits together

1. **Frontend** (`frontend/index.html`) is a static page. It fetches the
   name library from `GET /api/names`, lets the customer build a cart in
   memory, then on checkout calls the backend to create an order and start
   payment.
2. **Backend** (`backend/`) is a small Express API. It stores orders in
   `data/db.json`, and talks to **Paystack** to charge cards.
3. **Payments** run in one of two modes, decided automatically by whether
   `PAYSTACK_SECRET_KEY` is set:
   - **Dev/mock mode** (no key): checkout still creates a real order record,
     but "payment" is confirmed instantly by the backend itself — so you can
     test the entire flow with zero external accounts.
   - **Live mode** (key set): the backend calls Paystack's Transaction
     Initialize API and redirects the customer to Paystack's hosted
     checkout page. After payment, Paystack redirects back to the backend's
     `/api/payments/callback`, which verifies the transaction and sends the
     customer back to the frontend. Paystack's webhook
     (`/api/payments/webhook`) is also wired up as the reliable
     source of truth for payment status, independent of the browser redirect.

## Running it locally

One command runs the whole app — the backend serves the frontend itself:

```bash
cd backend
cp .env.example .env
npm install
npm start
```

Then open **http://localhost:4000** in your browser. That's the actual
storefront (not a JSON error) — the backend serves `frontend/index.html`
directly at its root, and the page calls `/api/...` on that same origin.

Without a Paystack key in `.env`, the server logs `Payments: DEV/MOCK mode`
— that's expected, and lets you test the entire order → cart → checkout →
payment → confirmation flow with zero external accounts.

Other routes worth knowing:
- `GET /health` — plain status check (`{"ok":true,...}`)
- `GET /api/names` — the raw name library as JSON

**Deploying the frontend separately?** (its own domain, a CDN, etc.) Point
it at the backend explicitly by adding this line above the existing
`<script>` block in `index.html`:
```html
<script>window.CR_FRAMES_API_BASE = "https://your-api.example.com";</script>
```
Without that override, the page calls whatever origin it was loaded from —
which only works when the backend is the one serving it, as it does by
default above. If the API truly can't be reached, the page quietly falls
back to a local name list and a client-only mock checkout so it never
breaks outright — but no real order is recorded in that case.

## Going live with real payments

1. Create a [Paystack](https://paystack.com) account and get your **secret
   key** (test key first, e.g. `sk_test_...`).
2. In `backend/.env`, set:
   ```
   PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxx
   PUBLIC_BASE_URL=https://your-api.example.com
   FRONTEND_URL=https://your-storefront.example.com
   ```
3. In your Paystack dashboard, add a webhook pointing to
   `https://your-api.example.com/api/payments/webhook`.
4. Redeploy the backend. It will log `Payments: LIVE mode` and the checkout
   flow will redirect customers to Paystack's real hosted checkout.
5. Swap the test key for a live key (`sk_live_...`) once you're ready to
   accept real payments.

## Deploying to production (Render — recommended)

Your backend already serves the frontend itself (`express.static` in
`server.js`), so the simplest, cheapest deployment is **one Render Web
Service** for the whole app — no separate frontend host, no CORS or
cross-origin URL wiring needed.

### Option A — Blueprint (fastest)

This repo includes `render.yaml` at its root, which Render can read
automatically:

1. Push this repo to GitHub (if you haven't already).
2. In the Render dashboard: **New +** → **Blueprint** → connect this repo.
   Render detects `render.yaml` and sets up the service automatically —
   root directory `backend`, build command `npm install`, start command
   `npm start`, all pre-filled.
3. Render will prompt you to fill in the env vars marked secret:
   ```
   PAYSTACK_SECRET_KEY   → your sk_live_... (or sk_test_... while testing)
   PUBLIC_BASE_URL        → https://your-service-name.onrender.com
   FRONTEND_URL            → https://your-service-name.onrender.com
   ```
   (Same URL for both — it's one service now.) You won't know the exact
   `.onrender.com` URL until after the first deploy, so deploy once, copy
   the URL Render gives you, then paste it into both fields and redeploy.
4. Confirm it's live: visit `https://your-service-name.onrender.com` —
   you should see the actual storefront, not a JSON error. Visit `/health`
   for a plain status check.

### Option B — Manual setup (no render.yaml)

If you'd rather configure it by hand instead of using the Blueprint:

1. **New +** → **Web Service** → connect this repo.
2. **Root Directory:** `backend`
3. **Build Command:** `npm install`
4. **Start Command:** `npm start`
5. Add the same three environment variables as above in the Render
   dashboard's **Environment** tab.
6. Deploy, then update `PUBLIC_BASE_URL`/`FRONTEND_URL` to the real
   `.onrender.com` URL once you have it, and redeploy.

### Then, point Paystack at the live backend

Paystack Dashboard → **Settings → API Keys & Webhooks** → set the webhook
URL to `https://your-service-name.onrender.com/api/payments/webhook`.

### A note on the free tier

Render's free tier spins your service down after 15 minutes of
inactivity and takes 30–60 seconds to wake up on the next request —
fine while you're testing, but a real customer hitting "Pay" during that
wake-up window would see a stall. Upgrade to the **Starter plan
(~$7/month)** once you're ready to take real orders, so the service stays
always-on.

### Custom domain (optional)

Once you own a domain (e.g. `crframes.ng` or similar), Render lets you
attach it under the service's **Settings → Custom Domains** — update
`PUBLIC_BASE_URL`/`FRONTEND_URL` and the Paystack webhook URL to match
your domain instead of the `.onrender.com` one when you do.

<details>
<summary>Alternative: splitting frontend (Vercel) and backend (Render)</summary>

If you'd specifically like the frontend on a CDN (Vercel) instead of
served by the backend, that still works — it just needs a bit more wiring:

1. Deploy `backend/` to Render as above, but only set `PAYSTACK_SECRET_KEY`
   and `PUBLIC_BASE_URL` (pointing at the Render URL).
2. Deploy `frontend/` to Vercel: **New Project** → root directory
   `frontend` → framework preset "Other" (it's static HTML, no build step).
3. In `frontend/index.html`, set:
   ```html
   <script>window.CR_FRAMES_API_BASE = "https://your-backend.onrender.com";</script>
   ```
   Commit and push — Vercel redeploys automatically.
4. Back on Render, set `FRONTEND_URL` to your real Vercel URL and redeploy.
5. Point the Paystack webhook at the Render backend URL as above.

</details>

## Pricing & the 3-name bundle deal

Regular price is ₦20,000 per name. Every group of 3 names is discounted
to ₦50,000 flat (saving ₦10,000 per bundle) — so 3 names is ₦50,000, 6 is
₦100,000, 4 is ₦70,000 (one bundle of 3 + one at regular price), and so on.
This is computed by `computeTotal()` in **both**
`backend/src/pricing.js` (the authoritative source — this is what
actually gets charged) and mirrored in `frontend/index.html`'s
`computeTotal()` (so the cart/checkout preview matches before the order
is even created). If you ever change the bundle size or price, update
both — they're small, clearly-commented functions.

## Frame styles, colours & automatic name lookup

- **Frame style toggle:** on the order builder, customers choose between
  "Arabic + Meaning" (the default — Arabic calligraphy, English name, and
  meaning) or "Arabic Script Only" (just the Arabic calligraphy, nothing
  else printed). This is stored per name as `style` on the order item.
- **Frame colour dropdown:** customers also pick a frame colour per name —
  White, Royal Gold, Black, Brown, or Green — previewed live in the order
  builder. Stored per item as `color`; the backend validates it against
  that fixed list and falls back to `"white"` for anything unrecognized.
- **Automatic meaning + Arabic script lookup:** when a customer types a
  name that isn't in the curated library (`backend/src/names-data.js`),
  the app can search the web for it instead of asking them to type the
  meaning in manually. `GET /api/names/lookup?name=...` checks the
  library first, then falls back to Wikipedia's public API (no key
  required) to suggest an Arabic script and meaning.
  - This is deliberately a *suggestion*, not an auto-fill-and-forget: the
    result is shown to the customer to review and edit before it's added
    to the cart, since it's printed onto a physical product exactly as
    entered. A wrong automated Arabic spelling is a real cost (a ruined
    frame), so there's always a human check-before-print step.
  - If nothing is found online either, the customer can still just type
    it in themselves — the manual fields never go away.

## Admin dashboard & order notifications

**Dashboard:** visit `/admin` (e.g. `http://localhost:4000/admin`) to see
every order — customer details, items, frame style/colour, total, and a
status dropdown you can update by hand as an order moves through
`pending_payment → paid → in_production → shipped → completed` (or `failed`).
It's protected by HTTP Basic Auth (a username/password prompt from the
browser itself, not a custom login page):

```
ADMIN_USERNAME=admin
ADMIN_PASSWORD=choose-a-real-password
```

Leave `ADMIN_PASSWORD` empty and the dashboard stays disabled (returns a
503 explaining why) — it won't silently sit open with a blank password.
This is deliberately simple (one shared login, no user accounts) since
there's a single operator; only use it over HTTPS, which Render gives you
by default.

**Email notifications:** you'll get an email when a new order is placed,
and again when one is paid. Works with any SMTP provider — Gmail (with an
[app password](https://myaccount.google.com/apppasswords)), Zoho,
SendGrid, Mailgun, etc:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=you@gmail.com
ADMIN_NOTIFY_EMAIL=you@gmail.com
```

Leave `SMTP_HOST` empty and notifications just print to the server
console instead of failing — handy for local testing before you've set
up a real mailbox for this.

On Render, add all of these (`ADMIN_USERNAME`, `ADMIN_PASSWORD`,
`SMTP_*`, `ADMIN_NOTIFY_EMAIL`) as environment variables the same way you
did `PAYSTACK_SECRET_KEY` — they're already listed in `render.yaml` if
you're using the Blueprint deploy.

## Production notes

- **Storage:** orders are stored in `backend/data/db.json` for simplicity.
  For real traffic, replace the functions in `src/db.js` with calls to a
  real database (Postgres, MySQL, MongoDB) — every other file only calls
  through that module, so nothing else needs to change.
- **Admin/fulfilment:** there's currently no admin view of incoming orders.
  The simplest next step is a protected `GET /api/orders` (list) endpoint
  plus a small internal page, or wiring order creation to notify you by
  email/WhatsApp.
- **Name library:** `backend/src/names-data.js` is the single source of
  truth for names, Arabic script, and meanings. Add more names there and
  both the search box and the gallery pick them up automatically.
- **Security:** validate/sanitize input further before production (the API
  already does basic required-field validation), add rate limiting to the
  order/payment endpoints, and serve everything over HTTPS.
