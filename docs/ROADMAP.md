# Legendary Collectibles – Product Roadmap

Status legend:

- ✅ Done / live (even if basic)
- 🟡 In progress / partial
- ⏳ Planned / not started
- 🧪 Experimental / future idea

---

## 1. Plans & Gating

### 1.1 Plan Definitions

**Status:** ✅

- ✅ Plan model in `src/lib/plans.ts`:
  - `free`
  - `collector`
  - `pro`
- ✅ Features + limits encoded per plan:
  - Free:
    - 1 collection
    - 500 total items
    - Amazon CTAs
    - No trends / top lists / CSV / insurance / advanced tools
  - Collector:
    - 5 collections
    - 5000 total items
    - Trends + PriceCharting leaderboards
    - Basic analytics
  - Pro:
    - Unlimited collections & items
    - CSV exports
    - Insurance-level reports (stub)
    - Advanced tools bucket

**Next steps:**

- ⏳ Tune copy & descriptions on `/pricing` page if needed.

---

### 1.2 Plan Storage & Stripe Integration

**Status:** 🟡

- ✅ Tables:
  - `billing_customers` (Stripe customer ↔ user)
  - `user_plans` (current plan per user)
- ✅ Stripe Checkout:
  - Route: `src/app/api/billing/create-checkout-session/route.ts`
  - Uses `STRIPE_PRICE_PRO` (recurring) and metadata `{ userId, plan: "pro" }`
- ✅ Stripe Webhook:
  - Route: `src/app/api/webhooks/stripe/route.ts`
  - Handles:
    - `checkout.session.completed` → upsert `billing_customers` + `user_plans`
    - `customer.subscription.deleted` → downgrade plan to `free`

**Next steps:**

- ⏳ Add a Collector checkout flow (separate Stripe price) if we want monthly Collector via Stripe.
- ⏳ Add a simple **Plan Status** panel on `/account` or `/settings` that shows:
  - Current plan
  - Renewal date (if we wire it later)
  - “Manage Billing” link (Stripe Customer Portal) – **not implemented yet**.

---

### 1.3 Plan-Based Gating (Front + Back)

**Status:** 🟡

- ✅ `getUserPlan(userId)` in `src/lib/plans.ts`.
- ✅ `PlanGate` component:
  - Used to wrap features that require `collector` or `pro`.
  - Currently wired to:
    - Pokémon card prices page
    - MTG card prices page
- ✅ Limits:
  - Logic to enforce:
    - Max collections
    - Max items
  - In `/api/collection/add` (and related routes) via plan-aware checks.

**Next steps:**

- ⏳ Audit all feature surfaces and ensure correct gating:
  - Top PriceCharting lists → Collector+
  - Trends / movers → Collector+
  - CSV export → Pro only
  - Insurance report → Pro only
- ⏳ Surface nice “Upgrade” banners when hitting limits or gated areas.

---

## 2. Collections & Items

### 2.1 Collections & Items Limits

**Status:** 🟡

- ✅ Plan limit model in `plans.ts`:
  - Free: 1 collection / 500 items
  - Collector: 5 collections / 5000 items
  - Pro: unlimited
- ✅ Backend enforcement:
  - API routes check limits and return clear 403 with upgrade info.
  - UI reads error and can show upgrade messaging (CardActions, etc.).

**Next steps:**

- ⏳ Double-check that every “add to collection” path uses the same limit logic.
- ⏳ Add a small “Usage bar” to `/collection` showing:
  - `X / Y items` and `collections used / allowed`.

---

### 2.2 Collection Analytics

**Status:** 🟡

- ✅ Daily valuation storage is implemented (per-user collection valuations).
- ✅ `/collection/analytics`:
  - Total value / cost / PnL
  - Game breakdown
  - Value over time chart
- 🟡 Gating:
  - Currently available to logged-in users.
  - We want:
    - Free → very limited or preview-only
    - Collector → full analytics
    - Pro → full analytics + extras (insurance, exports, advanced tools)

**Next steps:**

- ⏳ Implement plan-aware analytics:
  - Hide or blur some metrics for Free.
  - Show Pro-only extras (e.g., deeper breakdowns, export buttons).
- ⏳ Add 7-day and 30-day “portfolio performance” callouts, e.g.:
  > “Your collection gained +4.3% in the last 7 days.”

---

## 3. Price Data & Alerts

### 3.1 Price Sources per Game

**Status:** ✅

- Pokémon:
  - TCGplayer history: `tcg_card_prices_tcgplayer_history`
  - Cardmarket history: `tcg_card_prices_cardmarket_history`
  - PriceCharting snapshots for graded prices
- MTG:
  - Effective prices table: `mtg_prices_effective`
- YGO:
  - Current prices: `ygo_card_prices`
  - Advanced source breakdown: `ygo_card_prices_ebay`
  - History: `ygo_card_prices_history` (schema created, data fill TBD)

**Next steps:**

- ⏳ Make sure YGO nightly jobs also populate `ygo_card_prices_history`.
- ⏳ Confirm “effective” logic for each game:
  - TCGplayer vs Cardmarket vs eBay vs PriceCharting hierarchies.

---

### 3.2 Card Prices Pages (Per Card)

**Status:** 🟡

- ✅ Pokémon card prices page:
  - Market snapshot via `<MarketPrices category="pokemon" />`
  - PriceCharting snapshot (Collector+)
  - Top Pokémon by PriceCharting (Collector+)
  - Trends from TCGplayer + Cardmarket (Collector+)
- ✅ MTG card prices page (rewritten):
  - Uses `mtg_prices_effective` history
  - Market snapshot via `<MarketPrices category="mtg" />`
  - MTG PriceCharting snapshot (Collector+)
  - Top MTG by PriceCharting (Collector+)
  - Effective price trends (Collector+)
- 🟡 YGO card prices page:
  - Needs full “catch-up” to the MTG/Pokémon pattern.
  - History should come from `ygo_card_prices_history` once populated.

**Next steps:**

- ⏳ Finish YGO card prices page:
  - Wire to `ygo_card_prices` + `ygo_card_prices_history`.
  - Add PlanGate blocks matching Pokémon/MTG (Collector+ for advanced stuff).

---

### 3.3 Price Alerts

**Status:** 🟡 (Backend functional, UI minimal)

- ✅ Tables:
  - `price_alerts`
  - `price_alert_logs`
- ✅ Script:
  - `scripts/runPriceAlerts.mjs`
  - Uses `WRITE_HISTORY=1` flag for verbose logging.
  - Connects to Postgres (Neon) and:
    - Loads active alerts
    - Evaluates current price vs rule
    - Inserts logs into `price_alert_logs` when triggered
    - Avoids firing duplicates within 24h
- ✅ Basic test alert inserted & fired successfully.
- ⏳ UI:
  - No full user-facing management UI yet.
  - No per-plan quota checks wired to front-end (e.g., Free = 0, Collector = 5, Pro = more).

**Next steps:**

- ⏳ Add a **Price Alerts** page:
  - List alerts
  - Create / edit / delete alerts
  - Show last triggered time and current price
- ⏳ Plan-aware limits:
  - Free: 0 alerts
  - Collector: 5 alerts
  - Pro: higher or unlimited (TBD)
- ⏳ Optional: email or in-app notifications using alert logs.

---

## 4. Exports, Insurance & Reports

### 4.1 CSV Exports (Pro)

**Status:** ✅ (for core use case)

- ✅ `/api/collection/export`:
  - Pro-only (plan-gated).
  - Returns CSV of collection data.
- ✅ UI:
  - Export button visible for Pro on collection pages.

**Next steps:**

- ⏳ Add CSV export shortcuts on analytics & insurance pages.
- ⏳ Ensure export includes enough fields for inventory/insurance use.

---

### 4.2 Insurance Valuation Report (Pro)

**Status:** 🟡

- ✅ Page: `/collection/insurance`
  - Pro-focused, uses valuation data.
  - Shows a summary of portfolio value suitable for insurance discussion.
- ⏳ PDF download:
  - Button exists but is stubbed (“coming soon”).
  - No PDF generation backend yet.

**Next steps:**

- ⏳ Implement `/api/collection/insurance-report`:
  - Accepts user + collection scope.
  - Renders HTML → PDF (using a library or serverless).
  - Returns downloadable PDF for Pro users.

---

## 5. UX & Onboarding

### 5.1 Plan Benefits UI

**Status:** 🟡

- ✅ Plan benefits copy defined (Free vs Collector vs Pro).
- ✅ Some gating UIs use `PlanGate` messaging.
- ⏳ A small “Plan benefits” box on `/account` or `/settings`:
  - Summarize each plan’s perks.
  - Show current plan, with clear “Upgrade” button.
- ⏳ A stub **Insurance valuation** page is present, but needs polish to match final UX.

---

## 6. Email Jobs & Automation (Later)

**Status:** ⏳

Planned but not yet built:

- Monthly portfolio summary email (Collector+).
- Weekly “Top Movers” email (Collector+).
- Email hooks tied into price alerts (optional, Pro+).

---

## 7. Future / Experimental

**Status:** ⏳ / 🧪

- Bulk upload tools (Pro).
- Advanced eBay integration:
  - Listing helpers
  - “Optimal listing price” suggestions
- AI grading assistance (Pro+).
- Selling toolkit (inventory → listing → pricing help).
- Annual Pro plan (billing + pricing).

---

## 8. How to Use This Roadmap

- High-level status lives in **this file**.
- More granular “do this next” tasks live in `ROADMAP_TASKS.md`.
- For day-to-day work, check `docs/KANBAN.md` and tick items off there.
- When you finish something:
  1. Update this roadmap’s status emoji.
  2. Mark the corresponding task as ✅ in `ROADMAP_TASKS.md`.
  3. Add an entry in `CHANGELOG.md`.
