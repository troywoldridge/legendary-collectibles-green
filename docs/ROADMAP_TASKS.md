# Legendary Collectibles – Task Breakdown

Status legend:

- ✅ Done
- 🟡 In progress
- ⏳ Not started

Each task has an ID so you can reference it in commits and PRs.

---

## P1 – Plans & Gating

### [PLAN-001] Wire `user_plans` + `billing_customers` into plan resolution

**Status:** ✅  
**Notes:** `getUserPlan(userId)` now reads from `user_plans` (fallback: `free`).

---

### [PLAN-002] PlanGate: reusable plan gating component

**Status:** ✅  
**Notes:** Used on Pokémon & MTG prices pages; accepts `minPlan` and shows upgrade CTA.

---

### [PLAN-003] Enforce collection & item limits on /api endpoints

**Status:** 🟡  

**Goal:**  
Make sure Free / Collector / Pro limits are *actually enforced* on the backend for all collection-related operations, with clean error responses and nice upgrade CTAs on the frontend.

**Limits (current plan):**

- Free: 1 collection, 500 total items
- Collector: 5 collections, 5,000 total items
- Pro: unlimited collections and items

---

#### Backend – limit helpers

- [ ] Confirm `PLANS` + `getUserPlan()` return correct plan for:
  - [ ] Logged-out user → `free`
  - [ ] Fresh user with no row in `user_plans` → `free`
  - [ ] User with `user_plans.plan_id = 'collector'`
  - [ ] User with `user_plans.plan_id = 'pro'`
- [ ] Create/verify a central helper (e.g. `enforcePlanLimits` or `ensureWithinLimits`) in `src/lib/collections/limits.ts` that:
  - [ ] Accepts `{ plan, collectionsCount, itemsCount }`
  - [ ] Returns `ok: true` if within limits
  - [ ] Returns a structured object if blocked, for example:

    ```ts
    {
      ok: false,
      reason: "collections" | "items",
      maxCollections?: number | null,
      maxItemsTotal?: number | null,
      message: string; // human-friendly, for UI
      requiredPlan: "collector" | "pro";
    }
    ```

  - [ ] Treats `plan.id === 'pro'` as **unlimited** (ignore numeric caps)
  - [ ] Uses `PLANS[plan.id].limits.maxCollections` / `.maxItemsTotal`

---

#### Backend – wiring into API routes

- [ ] Identify all write endpoints that need enforcement:
  - [ ] `/api/collections/add` (or equivalent “create collection” route)
  - [ ] `/api/collections/[collectionId]/items` (add card to collection)
  - [ ] Any “clone/duplicate/import collection” endpoints (if present)
- [ ] At the top of each handler:
  - [ ] Get `{ userId }` from Clerk `auth()`
  - [ ] Load `plan = await getUserPlan(userId)`
  - [ ] Query counts:
    - [ ] `currentCollections = ...` (collections owned by user)
    - [ ] `currentItemsTotal = ...` (total items across all collections for user)
  - [ ] Call `enforcePlanLimits({ plan, collectionsCount, itemsCount })`
  - [ ] If blocked:
    - [ ] Return `403` JSON with a shape like:

      ```jsonc
      {
        "error": "limit_exceeded",
        "reason": "items",
        "requiredPlan": "collector",
        "currentItems": 500,
        "maxItems": 500,
        "planId": "free",
        "upgradeUrl": "/pricing?from=limit_items"
      }
      ```

- [ ] Make sure **read-only** endpoints (GETs) are *never* blocked by limits.

---

#### Frontend – handling limit errors cleanly

- [ ] In collection-related client code (e.g. `CardActions`, “Add to Collection” UI):
  - [ ] Catch `403` responses from the above APIs.
  - [ ] If `error === "limit_exceeded"`:
    - [ ] Show a friendly toast/banner:
      - [ ] “You’ve hit the limit for the Free plan. Upgrade to Collector to add more cards.”
    - [ ] Link the CTA to `upgradeUrl` from the JSON (fallback: `/pricing`)
- [ ] On collection-overview / dashboard page:
  - [ ] Show a small “capacity” meter:
    - [ ] “500 / 500 items used – Upgrade to Collector for 5,000 items”
    - [ ] “1 / 1 collection – Upgrade for more collections”
  - [ ] Only show this meter when user is **not Pro**.

---

#### Testing & verification

- [ ] In local dev, temporarily force plan:
  - [ ] `getUserPlan()` returns `free` for your account → try to:
    - [ ] Create 2+ collections → second should be blocked.
    - [ ] Add items beyond 500 → extra adds should be blocked.
  - [ ] Change DB row to `collector`:
    - [ ] Confirm 5 collections / 5,000 items work; 6th/5001st blocked.
  - [ ] Change to `pro`:
    - [ ] Confirm no limits block actions.
- [ ] Verify UI reactions:
  - [ ] Error message is friendly.
  - [ ] CTA button takes you to `/pricing` with a helpful query param.

---

#### Nice-to-have (later)

- [ ] Add a small admin-only override mechanism (flag on user) to bypass limits for test accounts.
- [ ] Add basic unit tests around `enforcePlanLimits` logic.

### [PLAN-004] Plan Benefits block on /account or /settings

**Status:** ⏳  
**Description:**  
Small visual block showing:

- Current plan
- Key perks
- Upgrade button

---

## P2 – Card Prices & Price Data

### PRICE-001 — YGO effective prices & history *(⏳ In Progress)*

**Status:** ⏳ In Progress  
**Owner:** Troy  
**Started:** 2025-11-21  

**Goal:** Define and compute “effective” YGO prices (like MTG effective), and populate a history table we can graph.

- [ ] Decide YGO effective price strategy
  - [ ] Effective YGO price priority:
    - [ ] 1️⃣ `ygo_card_prices.tcgplayer_price` (USD)
    - [ ] 2️⃣ `ygo_card_prices.cardmarket_price` (EUR, convert if needed)
    - [ ] 3️⃣ `ygo_card_prices.ebay_price`
    - [ ] 4️⃣ `ygo_card_prices.amazon_price`
    - [ ] 5️⃣ `ygo_card_prices.coolstuffinc_price`
  - [ ] For each card, choose the **best available** source per run.
  - [ ] Store:
    - [ ] `effective_price`
    - [ ] `effective_currency` ("USD" | "EUR")
    - [ ] `source_used` ("tcgplayer" | "cardmarket" | "ebay" | "amazon" | "coolstuffinc")

- [ ] Schema additions (if not already present)
  - [ ] Table: `ygo_card_prices_effective`
    - [ ] `card_id` (PK, FK → ygo_cards.card_id)
    - [ ] `effective_price` (numeric)
    - [ ] `effective_currency` (text)
    - [ ] `source` (text)
    - [ ] `updated_at` (timestamptz, default now())
  - [ ] Table: `ygo_card_prices_history`
    - [ ] Already exists, but:
      - [ ] Confirm columns:
        - [ ] `id` (PK)
        - [ ] `card_id` (text)
        - [ ] `captured_at` (timestamptz, default now())
        - [ ] `tcgplayer_price` (numeric)
        - [ ] `cardmarket_price` (numeric)
        - [ ] `ebay_price` (numeric)
        - [ ] `amazon_price` (numeric)
        - [ ] `coolstuffinc_price` (numeric)

- [ ] Nightly job to populate history from live prices
  - [ ] Script: `scripts/ygoPricesToHistory.mjs` (or similar)
    - [ ] Read from `ygo_card_prices` (current snapshot)
    - [ ] Insert into `ygo_card_prices_history`:
      - [ ] One row per card where at least one price is non-null
    - [ ] Also upsert into `ygo_card_prices_effective`:
      - [ ] Pick best source per priority
      - [ ] Compute currency/price
      - [ ] Set `updated_at = now()`

- [ ] Wiring into pricing helpers
  - [ ] Add helper in `src/lib/pricing` (or dedicated `src/lib/ygoPricing.ts`):
    - [ ] `getEffectiveYgoPrice(cardId: string)` → `{ price: number | null; currency: "USD" | "EUR" | null; source: string | null }`
  - [ ] Use this helper in:
    - [ ] Market/trend pages for YGO
    - [ ] Price alerts (ALERT-001) when evaluating YGO alerts.

- [ ] Testing
  - [ ] Run script once manually:
    - [ ] Verify new rows in `ygo_card_prices_history` and `ygo_card_prices_effective`.
  - [ ] Spot-check a few cards:
    - [ ] Confirm effective price matches expectation (prefers TCGplayer, then Cardmarket, etc.).

### PRICE-002 — YGO trends & /prices page wiring

**Goal:** Bring YGO up to parity with Pokémon/MTG for per-card price pages and trend metrics.

- [ ] YGO `/prices` detail page
  - [ ] Route: `/categories/ygo/cards/[id]/prices`
  - [ ] Behavior:
    - [ ] Resolve card ID (similar to MTG/Pokémon resolver)
    - [ ] Render:
      - [ ] Header: “Prices: {card name}”
      - [ ] Market snapshot via `<MarketPrices category="ygo" ... />`
      - [ ] PriceCharting snapshot (if/when you add PriceCharting for YGO)
      - [ ] Trend metrics, driven by `ygo_card_prices_history`

- [ ] Trend calculations (similar to Pokémon/MTG)
  - [ ] For a given card:
    - [ ] Load last 90 days from `ygo_card_prices_history`
    - [ ] Compute:
      - [ ] Latest effective price (using PRICE-001 logic)
      - [ ] Price 7 days ago
      - [ ] Price 30 days ago
    - [ ] Output:
      - [ ] Table with “Latest”, “7d”, “30d” columns
      - [ ] `pctChange` helper like MTG/Pokémon pages

- [ ] Plan gating for YGO prices page
  - [ ] Use `getUserPlan(userId)` + `PlanGate`:
    - [ ] Everyone:
      - [ ] Market snapshot (**MarketPrices**)
    - [ ] Collector+:
      - [ ] YGO trend metrics & any PriceCharting blocks (once available)
    - [ ] Free:
      - [ ] See teaser / stub: “Upgrade to Collector to unlock YGO trends & analytics”.

- [ ] Global “Top YGO cards” (later if data available)
  - [ ] Add helper:
    - [ ] `getTopYgoCardsByEffectivePrice(limit: number)` using `ygo_card_prices_effective`.
  - [ ] Section on a YGO category/landing page:
    - [ ] “Top YGO Cards by Market Price”
    - [ ] Gated to Collector+ (similar to Pokémon/MTG Top lists).

- [ ] Testing
  - [ ] As Free:
    - [ ] Visit a YGO `/prices` page:
      - [ ] See Market snapshot but no detailed trend metrics.
  - [ ] As Collector:
    - [ ] See trend table (Latest / 7d / 30d) for YGO cards with history.
  - [ ] As Pro:
    - [ ] Same as Collector plus anything Pro-only you decide to add later (CSV exports, etc.).

### [PRICE-003] YGO card prices page – modernized

**Status:** ⏳  
**TODO:**

- Use `ygo_card_prices` for current price.
- Use `ygo_card_prices_history` for trends once populated.
- Follow same layout & PlanGate sections as MTG/Pokémon.

---

### [PRICE-004] Populate `ygo_card_prices_history` nightly

**Status:** ⏳  
**Description:**  
Nightly script that:

- Reads current `ygo_card_prices`/`ygo_card_prices_ebay`.
- Appends a snapshot to `ygo_card_prices_history`.

---

## P3 – Price Alerts

### [ALERT-001] Create `price_alerts` and `price_alert_logs` tables

### ALERT-001 — Price alerts: backend polish & safety

**Goal:** Make sure the price alerts pipeline is solid, safe, and ready for real users.

- [ ] Schema sanity check
  - [ ] Confirm final structure of `price_alerts`:
    - [ ] `id` (PK, serial/bigserial)
    - [ ] `user_id` (text, Clerk user id)
    - [ ] `game` (text: "pokemon" | "mtg" | "ygo" | "other")
    - [ ] `target_card_id` (text, not null)
    - [ ] `source` (text: "market" | "tcgplayer" | "cardmarket" | "pricecharting" | etc.)
    - [ ] `rule_type` (text: "at_or_below" | "at_or_above")
    - [ ] `threshold` (numeric)
    - [ ] `active` (boolean, default true)
    - [ ] `created_at` (timestamptz, default now())
    - [ ] `fired_at` (timestamptz, nullable — last-fired time)
  - [ ] Confirm final structure of `price_alert_logs`:
    - [ ] `id` (PK)
    - [ ] `alert_id` (FK → price_alerts.id, on delete cascade)
    - [ ] `user_id` (text)
    - [ ] `game` (text)
    - [ ] `target_card_id` (text, NOT NULL)
    - [ ] `source` (text)
    - [ ] `rule_type` (text)
    - [ ] `threshold` (numeric)
    - [ ] `price` / `triggered_price` (numeric)
    - [ ] `details` / `payload` (jsonb or text, optional)
    - [ ] `triggered_at` (timestamptz, default now())
    - [ ] `fired_at` (timestamptz, default now())

- [ ] Worker script (`scripts/runPriceAlerts.mjs`)
  - [ ] Confirm it:
    - [ ] Selects **active** alerts from `price_alerts`
    - [ ] Skips alerts that already fired in the last 24h (or configured cooldown)
    - [ ] Computes **current price** per game/source:
      - [ ] Pokémon: TCGplayer → Cardmarket → PriceCharting fallback
      - [ ] MTG: uses effective MTG prices (mtg_prices_effective)
      - [ ] YGO: uses `ygo_card_prices` effective logic (see PRICE-001)
    - [ ] Evaluates rule:
      - [ ] `at_or_below`: trigger if current price <= threshold
      - [ ] `at_or_above`: trigger if current price >= threshold
    - [ ] When triggered:
      - [ ] Inserts row into `price_alert_logs`
      - [ ] Updates `price_alerts.fired_at = now()`

- [ ] Config & environment
  - [ ] Ensure `DATABASE_URL` is read correctly in the worker (no local/env mismatch).
  - [ ] Optional: add `DEBUG_PRICE_ALERTS_DB` logging block to quickly debug future DB issues.

- [ ] Safety / edge cases
  - [ ] If price is `NULL` for a given source:
    - [ ] Skip the alert and optionally log a “no price available” info.
  - [ ] If threshold is `NULL` or invalid:
    - [ ] Skip & mark alert as inactive or log an error.
  - [ ] Avoid double-trigger within the cooldown window.

- [ ] Testing
  - [ ] Create a manual test alert:
    - [ ] `INSERT INTO price_alerts (...) VALUES (...);`
  - [ ] Run: `WRITE_HISTORY=1 node scripts/runPriceAlerts.mjs`
    - [ ] See at least one alert picked up.
    - [ ] Confirm log row inserted into `price_alert_logs`.
    - [ ] Confirm `price_alerts.fired_at` updated.
  - [ ] Run again within 24h:
    - [ ] Confirm “already fired in last 24h; skipping duplicate” behavior.

---

### [ALERT-002] Implement `scripts/runPriceAlerts.mjs` worker

### ALERT-002 — Price alerts UI & UX

**Goal:** Let users create/manage price alerts from the UI and see their history.

- [ ] Backend API endpoints (app router)
  - [ ] `GET /api/alerts` — list current user’s alerts
    - [ ] Auth required
    - [ ] Returns:
      - [ ] id, game, target_card_id, source, rule_type, threshold, active, created_at, fired_at
  - [ ] `POST /api/alerts` — create a new alert
    - [ ] Body:
      - [ ] `game`, `target_card_id`, `source`, `rule_type`, `threshold`
    - [ ] Validations:
      - [ ] User must be logged in
      - [ ] Threshold > 0
      - [ ] Maybe enforce **max active alerts** by plan (e.g., Free=0, Collector=5, Pro=unlimited)
  - [ ] `PATCH /api/alerts/:id` — update alert (active, threshold, etc.)
  - [ ] `DELETE /api/alerts/:id` — soft-delete or hard-delete alert

- [ ] Plan gating
  - [ ] Decide caps:
    - [ ] Free: 0 alerts (or maybe 1 as teaser)
    - [ ] Collector: 5 alerts
    - [ ] Pro: unlimited (or high cap)
  - [ ] Enforce caps in:
    - [ ] `POST /api/alerts` (returns 403 with nice JSON if over limit)
  - [ ] Use `getUserPlan` + `planCapabilities` (or new helper like `maxAlerts`) for logic.

- [ ] Card detail integration
  - [ ] On Pokémon/MTG/YGO card detail page:
    - [ ] Add a “Price alerts” mini-panel.
    - [ ] If logged out:
      - [ ] Show “Sign in to create price alerts” CTA.
    - [ ] If logged in:
      - [ ] Show:
        - [ ] Current effective price (from MarketPrices or effective helpers)
        - [ ] A simple form:
          - [ ] Rule type: “Alert me when price is at or below”
          - [ ] Threshold input (prefilled with current price)
          - [ ] Source selector (or default “market best” for now)
        - [ ] “Create alert” button → `POST /api/alerts`
      - [ ] If user already has an alert for this card:
        - [ ] Show its state + simple toggle to deactivate/reactivate.

- [ ] “My Alerts” page
  - [ ] Route: `/alerts` (or `/account/alerts`)
  - [ ] Shows table/list:
    - [ ] Columns:
      - [ ] Game
      - [ ] Card (linked to detail page)
      - [ ] Rule (e.g., “≤ $5.00 (market)”)
      - [ ] Last fired (from `fired_at`)
      - [ ] Active toggle
    - [ ] Actions:
      - [ ] Toggle active
      - [ ] Edit threshold
      - [ ] Delete alert

- [ ] Alert history view (optional v1)
  - [ ] Under each alert row, or on separate tab:
    - [ ] Shows last N rows from `price_alert_logs` for that alert:
      - [ ] triggered_at, triggered_price, maybe details.

- [ ] Testing
  - [ ] As Free user:
    - [ ] Try to create an alert:
      - [ ] Get plan-gated message / CTA to upgrade.
  - [ ] As Collector:
    - [ ] Can create up to N alerts, after which POST returns 403 with “limit reached”.
  - [ ] As Pro:
    - [ ] Can create many alerts.
    - [ ] Worker (`runPriceAlerts.mjs`) fires and logs appear for alerts created in the UI.

### [ALERT-003] Price alerts UI

**Status:** ⏳  
**Description:**  
Page like `/alerts`:

- List alerts (with status + last fired time).
- Form to create new alert:
  - game
  - card_id
  - rule type (at_or_below, at_or_above)
  - threshold
- Ability to pause/disable alerts.

---

### [ALERT-004] Per-plan alert limits

**Status:** ⏳  
**Planned:**

- Free: 0 alerts
- Collector: 5 alerts
- Pro: higher or unlimited (TBD)

Implementation:

- Validate alert count on create.
- Show upgrade CTA when hitting limit.

---

## P4 – Analytics, Exports, Insurance

### [ANALYTICS-001] Plan-aware analytics gating

**Status:** ⏳  
**Goal:**

- Free: simple summary / teaser.
- Collector: full analytics.
- Pro: analytics + extras (insurance, export buttons).

---

### [EXPORT-001] Collection CSV export (Pro)

**Status:** ✅  
**Notes:** `/api/collection/export` implemented + Pro gating.

---

### [INS-001] Insurance valuation page + Pro gating

**Status:** 🟡  

**Goal:**  
Give Pro users an “Insurance-ready” view of their collection with clear totals and an eventual “Download PDF” report. Free/Collector should see the feature, but gated.

---

#### Routing & plan-gating

- [ ] Confirm route for the page:
  - [ ] `GET /collection/insurance` (App Router page)
- [ ] On the **server component**:
  - [ ] Use `auth()` to get `{ userId }`.
  - [ ] Load `plan = await getUserPlan(userId ?? null)`.
  - [ ] If no user:
    - [ ] Show sign-in CTA (`/sign-in?redirect_url=/collection/insurance`).
  - [ ] If `plan.id !== "pro"`:
    - [ ] Show **read-only marketing stub**:
      - [ ] “Insurance Valuation Reports are a Pro feature.”
      - [ ] Bullet points explaining:
        - [ ] Summed replacement value by game / condition.
        - [ ] Snapshot for insurance adjusters.
        - [ ] Export as PDF.
      - [ ] “Upgrade to Pro” button → `/pro?from=insurance`
- [ ] If `plan.id === "pro"`:
  - [ ] Render full Pro-only valuation UI.

---

#### Data model & valuation logic

- [ ] Confirm which data source to use for valuation:
  - [ ] Primary: **latest market price** per card from:
    - [ ] Pokémon: TCGplayer / Cardmarket / PriceCharting effective combo.
    - [ ] MTG: `mtg_prices_effective`.
    - [ ] YGO: `ygo_card_prices` (best of tcgplayer/cardmarket/ebay/etc.).
- [ ] For each collection item:
  - [ ] Derive:
    - [ ] `game` (pokemon / mtg / ygo / other).
    - [ ] `card_id` and display name.
    - [ ] condition/grade (if tracked).
    - [ ] `qty`.
    - [ ] `unit_value` (effective price).
    - [ ] `total_value = qty * unit_value`.
- [ ] Aggregate into an “insurance snapshot” shape:

  ```ts
  type InsuranceSnapshot = {
    asOf: string; // ISO date-time
    totalValue: number;
    byGame: {
      pokemon?: { totalValue: number; itemCount: number };
      mtg?: { totalValue: number; itemCount: number };
      ygo?: { totalValue: number; itemCount: number };
      other?: { totalValue: number; itemCount: number };
    };
    topHoldings: Array<{
      game: string;
      cardId: string;
      name: string | null;
      qty: number;
      unitValue: number;
      totalValue: number;
    }>;
  };
  ```

#### UI for /collection/insurance (Pro)

- [ ] Header section
  - [ ] Title: **“Insurance Valuation”**
  - [ ] Subtitle: “A snapshot of your collection for insurance and documentation.”
  - [ ] Badge/chip: “Pro Feature”

- [ ] Summary cards
  - [ ] Show **Total collection value** (using `formatMoney` in the chosen display currency)
  - [ ] Show **Total items** in the collection
  - [ ] Show **Date of snapshot** (`asOf` timestamp from the valuation)

- [ ] By-game breakdown
  - [ ] Render a simple responsive grid with one card per game:
    - [ ] Pokémon – total value + item count
    - [ ] MTG – total value + item count
    - [ ] YGO – total value + item count
    - [ ] “Other” – total value + item count (only if present)
  - [ ] Each card should show:
    - [ ] Game label
    - [ ] Formatted total value
    - [ ] Item count (e.g. “123 items”)

- [ ] Top holdings table
  - [ ] Columns:
    - [ ] Game
    - [ ] Card
    - [ ] Qty
    - [ ] Unit value
    - [ ] Total value
  - [ ] Card cell:
    - [ ] Show card name (fallback to card_id if name is null)
    - [ ] Link to the appropriate card detail page
  - [ ] Unit/total value:
    - [ ] Use `formatMoney` with same display currency used in the summary

- [ ] “Download PDF (coming soon)” button
  - [ ] Visible only for Pro users
  - [ ] For now:
    - [ ] Render as a disabled-looking button (`opacity-60`, `cursor-not-allowed`)
    - [ ] Add helper text / tooltip nearby:
      - [ ] “PDF export is coming soon. For now, you can screenshot this page for your records.”

- [ ] Empty-state behavior
  - [ ] If user has **no items in their collection**:
    - [ ] Show a friendly placeholder:
      - [ ] “Add items to your collection to generate an insurance valuation snapshot.”
    - [ ] Hide the table + summary cards (or show them with `—` values)

---

#### (Later) PDF export endpoint (stub)

- [ ] Add route: `POST /api/collection/insurance-report`
  - [ ] No request body needed (use the authenticated user’s data)
  - [ ] Requirements:
    - [ ] User must be logged-in
    - [ ] `plan.id === "pro"`
  - [ ] For now, just return a stub:

    ```jsonc
    {
      "error": "pdf_not_implemented",
      "message": "PDF export is coming soon."
    }
    ```

- [ ] Wire the “Download PDF” button to this endpoint
  - [ ] On click:
    - [ ] Call `/api/collection/insurance-report`
    - [ ] If response is `pdf_not_implemented`:
      - [ ] Show a toast/snackbar:
        - [ ] “PDF export is coming soon; this button will download a full report later.”

---

#### Testing checklist

- [ ] As **Free** user
  - [ ] Visit `/collection/insurance`
  - [ ] See a **marketing stub** + “Upgrade to Pro” CTA
  - [ ] No valuation numbers or tables visible

- [ ] As **Collector** user
  - [ ] Visit `/collection/insurance`
  - [ ] Same gated experience as Free
  - [ ] Copy can mention: “Upgrade from Collector to Pro” if you want
  - [ ] Still **no numeric valuations** visible

- [ ] As **Pro** user
  - [ ] Visit `/collection/insurance`
  - [ ] See full valuation summary (total, by-game, top holdings)
  - [ ] Numbers roughly match `/collection/analytics` values
  - [ ] “Download PDF (coming soon)” button is visible but clearly disabled/inactive

- [ ] API protections
  - [ ] `POST /api/collection/insurance-report`:
    - [ ] Returns `401/403` for not-logged-in or non-Pro users
    - [ ] Returns `501`-style JSON with `pdf_not_implemented` for Pro users

---

#### Nice-to-have ideas (future)

- [ ] Let user add extra metadata for the report:
  - [ ] Insurance company name
  - [ ] Policy number
  - [ ] Contact info (agent, phone/email)
- [ ] Allow user to choose valuation mode:
  - [ ] “Replacement value” vs “Quick-sale value”
- [ ] Track and store historical insurance snapshots:
  - [ ] Simple list of past snapshots with:
    - [ ] Date/time
    - [ ] Total value at that snapshot
    - [ ] Optional “Download PDF” link when implemented

### [INS-002] Insurance PDF endpoint

**Status:** ⏳  
**Plan:**

- Create `/api/collection/insurance-report` (Pro-only).
- Render HTML → PDF.
- Return download link or direct PDF response.

---

## P5 – Email & Automation (Later)

### [EMAIL-001] Monthly portfolio summary email (Collector+)

**Status:** ⏳  

---

### [EMAIL-002] Weekly top movers email (Collector+)

**Status:** ⏳  

---

### [EMAIL-003] Email notifications for price alerts (Pro+)

**Status:** ⏳  

---

## P6 – Pro Power Tools (Future)

### [PRO-TOOLS-001] Bulk upload tools

**Status:** ⏳  

---

### [PRO-TOOLS-002] Advanced eBay integration

**Status:** ⏳  

---

### [PRO-TOOLS-003] AI grading assistance

**Status:** ⏳  

---

### [PRO-TOOLS-004] Selling toolkit

**Status:** ⏳  
