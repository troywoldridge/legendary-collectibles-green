
// scripts/runPriceAlerts.mjs
//
// Run:
//   WRITE_HISTORY=1 node scripts/runPriceAlerts.mjs
//
// Env needed:
//   DATABASE_URL=postgresql://neondb_owner:npg_zjI7Ze1SulRs@ep-bitter-salad-admygey6.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
//   CLERK_SECRET_KEY=sk_... (for fetching user emails)
//   RESEND_API_KEY=re_...   (optional; for sending email)
//   ALERT_FROM_EMAIL=alerts@legendary-collectibles.com (or similar)

import "dotenv/config";
import { Pool } from "pg";

const DATABASE_URL =
    "postgresql://neondb_owner:npg_zjI7Ze1SulRs@ep-bitter-salad-admygey6.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const ALERT_FROM_EMAIL =
  process.env.ALERT_FROM_EMAIL || "alerts@legendary-collectibles.com";

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 4,
});

// --- TEMP DEBUG: prove what DB + columns this script sees ---
async function debugDb() {
  const client = await pool.connect();
  try {
    const info = await client.query('SELECT current_database(), current_user');
    console.log('[debug] DB info:', info.rows);

    const cols = await client.query(`
      SELECT table_schema, column_name
      FROM information_schema.columns
      WHERE table_name = 'price_alerts'
      ORDER BY table_schema, ordinal_position
    `);
    console.log('[debug] price_alerts columns:', cols.rows);
  } finally {
    client.release();
  }
}

// 👇 Add this near the top, before your main run() is called
if (process.env.DEBUG_PRICE_ALERTS_DB === '1') {
  await debugDb();
  process.exit(0);
}

/* ------------------------------------------------
   Helpers
------------------------------------------------ */

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normGame(raw) {
  const v = (raw || "").toLowerCase();
  if (v === "magic") return "mtg";
  if (v === "ygo") return "yugioh";
  return v;
}

function gameLabel(game) {
  switch (normGame(game)) {
    case "pokemon":
      return "Pokémon";
    case "mtg":
      return "Magic: The Gathering";
    case "yugioh":
      return "Yu-Gi-Oh!";
    default:
      return game || "Unknown";
  }
}

function isTriggered(ruleType, threshold, price) {
  if (price == null) return false;
  const t = Number(threshold);
  const p = Number(price);
  if (!Number.isFinite(t) || !Number.isFinite(p)) return false;

  if (ruleType === "at_or_below") return p <= t;
  if (ruleType === "at_or_above") return p >= t;
  return false;
}

/* ------------------------------------------------
   Price sources
------------------------------------------------ */

/**
 * Pokémon:
 *   1) tcg_card_prices_tcgplayer.normal / holofoil / reverse_holofoil
 *   2) fallback Cardmarket trend price
 *
 * Assumes prices are numeric (USD/EUR) in DB and you set thresholds
 * to match the numbers you see in the UI.
 */
async function getPokemonPrice(client, cardId) {
  const q = `
    SELECT
      COALESCE(
        NULLIF(t.normal, '')::numeric,
        NULLIF(t.holofoil, '')::numeric,
        NULLIF(t.reverse_holofoil, '')::numeric
      ) AS tcg_price,
      c.trend_price::numeric AS cm_trend
    FROM tcg_card_prices_tcgplayer t
    LEFT JOIN tcg_card_prices_cardmarket c
      ON c.card_id = t.card_id
    WHERE t.card_id = $1
    LIMIT 1
  `;

  const { rows } = await client.query(q, [cardId]);
  const row = rows[0];
  if (!row) return null;

  if (row.tcg_price != null) return Number(row.tcg_price);
  if (row.cm_trend != null) return Number(row.cm_trend);

  return null;
}

/**
 * MTG:
 *   mtg_prices_effective.effective_usd
 */
async function getMtgPrice(client, cardId) {
  const q = `
    SELECT effective_usd
    FROM mtg_prices_effective
    WHERE scryfall_id = $1
    ORDER BY effective_updated_at DESC
    LIMIT 1
  `;
  const { rows } = await client.query(q, [cardId]);
  const v = rows[0]?.effective_usd;
  return v == null ? null : Number(v);
}

/**
 * YGO:
 *   1) tcgplayer_price
 *   2) cardmarket_price
 *   3) ebay_price
 *   4) amazon_price
 *   5) coolstuffinc_price
 */
async function getYgoPrice(client, cardId) {
  const q = `
    SELECT
      COALESCE(
        tcgplayer_price,
        cardmarket_price,
        ebay_price,
        amazon_price,
        coolstuffinc_price
      )::numeric AS best
    FROM ygo_card_prices
    WHERE card_id = $1
    LIMIT 1
  `;
  const { rows } = await client.query(q, [cardId]);
  const v = rows[0]?.best;
  return v == null ? null : Number(v);
}

async function getBestPrice(client, gameRaw, cardId) {
  const game = normGame(gameRaw);
  if (game === "pokemon") return getPokemonPrice(client, cardId);
  if (game === "mtg") return getMtgPrice(client, cardId);
  if (game === "yugioh") return getYgoPrice(client, cardId);

  console.warn(`Unknown game '${gameRaw}' for alert; skipping.`);
  return null;
}

/* ------------------------------------------------
   Clerk + Resend
------------------------------------------------ */

async function getUserEmail(userId) {
  if (!CLERK_SECRET_KEY || !userId) return null;

  const url = `https://api.clerk.dev/v1/users/${encodeURIComponent(userId)}`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${CLERK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      console.error(
        `[price-alerts] Clerk user fetch failed for ${userId}:`,
        res.status,
        await res.text(),
      );
      return null;
    }

    const data = await res.json();
    const primaryId = data.primary_email_address_id;
    const emails = data.email_addresses || [];
    const primary = emails.find((e) => e.id === primaryId) || emails[0];
    return primary?.email_address || null;
  } catch (err) {
    console.error("[price-alerts] Clerk error:", err);
    return null;
  }
}

async function sendAlertEmail({ to, game, cardId, price, threshold, ruleType }) {
  const subject = `Price alert hit for ${gameLabel(game)} card`;
  const dir = ruleType === "at_or_below" ? "at or below" : "at or above";

  const bodyText = [
    `Your price alert has triggered for a ${gameLabel(game)} card.`,
    "",
    `Card ID: ${cardId}`,
    `Rule: ${dir} $${Number(threshold).toFixed(2)}`,
    `Current price: $${Number(price).toFixed(2)}`,
    "",
    `You can manage your alerts in your Legendary Collectibles account.`,
  ].join("\n");

  const bodyHtml = `
    <p>Your price alert has triggered for a <strong>${gameLabel(
      game,
    )}</strong> card.</p>
    <p>
      <strong>Card ID:</strong> ${cardId}<br/>
      <strong>Rule:</strong> ${dir} $${Number(threshold).toFixed(2)}<br/>
      <strong>Current price:</strong> $${Number(price).toFixed(2)}
    </p>
    <p>You can manage your alerts in your Legendary Collectibles account.</p>
  `;

  if (!RESEND_API_KEY || !ALERT_FROM_EMAIL || !to) {
    console.log(
      `[price-alerts] Would send email → ${to || "UNKNOWN"} :: ${subject}`,
    );
    console.log(bodyText);
    return;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: ALERT_FROM_EMAIL,
        to: [to],
        subject,
        text: bodyText,
        html: bodyHtml,
      }),
    });

    if (!res.ok) {
      console.error(
        "[price-alerts] Resend error:",
        res.status,
        await res.text(),
      );
    } else {
      console.log(`[price-alerts] Email sent to ${to} for card ${cardId}`);
    }
  } catch (err) {
    console.error("[price-alerts] Resend exception:", err);
  }
}

/* ------------------------------------------------
   Main
------------------------------------------------ */

async function runOnce() {
  const client = await pool.connect();
  try {
    console.log(
      `[price-alerts] Run started at ${new Date().toISOString()}`,
    );

    // 1) Load all active alerts
    const { rows: alerts } = await client.query(
      `
      SELECT
        id,
        user_id,
        game,
        target_card_id,
        source,
        rule_type,
        threshold,
        active
      FROM price_alerts
      WHERE active = TRUE
    `,
    );

    if (alerts.length === 0) {
      console.log("[price-alerts] No active alerts. Done.");
      return;
    }

    console.log(`[price-alerts] Found ${alerts.length} active alerts.`);

    for (const alert of alerts) {
      const {
  id: alertId,
  user_id: userId,
  game,
  target_card_id: cardId,
  source,                 // <-- add this
  rule_type: ruleType,
  threshold,
} = alert;


      try {
        const price = await getBestPrice(client, game, cardId);
        if (price == null) {
          console.log(
            `[price-alerts] No price for ${game}/${cardId}; skipping alert ${alertId}`,
          );
          continue;
        }

        if (!isTriggered(ruleType, threshold, price)) {
          console.log(
            `[price-alerts] Alert ${alertId} not triggered (price=${price}, threshold=${threshold}).`,
          );
          continue;
        }

        // Check if this alert already fired in the last 24h
        const { rows: recent } = await client.query(
          `
          SELECT 1
          FROM price_alert_logs
          WHERE alert_id = $1
            AND fired_at >= now() - INTERVAL '1 day'
          LIMIT 1
        `,
          [alertId],
        );

        if (recent.length > 0) {
          console.log(
            `[price-alerts] Alert ${alertId} already fired in last 24h; skipping duplicate.`,
          );
          continue;
        }

       // Insert log (normalized to current schema)
await client.query(
  `
  INSERT INTO price_alert_logs (
    alert_id,
    user_id,
    game,
    target_card_id,
    source,
    rule_type,
    threshold,
    triggered_price,
    triggered_at,
    fired_at,
    card_id,
    price_when_fired,
    details,
    price
  )
  VALUES (
    $1, $2, $3, $4, $5, $6, $7,
    $8, $9, $10,
    $11, $12, $13, $14
  )
`,
  [
    alertId,
    userId,
    normGame(game),

    // ✅ make sure both target_card_id and card_id are set
    cardId,          // target_card_id
    source,          // e.g. "market" or "pricecharting"
    ruleType,
    threshold,

    // price data
    price,           // triggered_price
    new Date(),      // triggered_at
    new Date(),      // fired_at
    cardId,          // card_id
    price,           // price_when_fired
    null,            // details (leave null for now)
    price,           // price (denormalized copy)
  ],
);


        // Send email
        const email = await getUserEmail(userId);
        await sendAlertEmail({
          to: email,
          game,
          cardId,
          price,
          threshold,
          ruleType,
        });

        // Just to avoid hammering Clerk/Resend if you have a LOT of alerts
        await sleep(100);
      } catch (err) {
        console.error(
          `[price-alerts] Error handling alert ${alertId}:`,
          err,
        );
      }
    }

    console.log("[price-alerts] Run complete.");
  } finally {
    client.release();
  }
}

/* ------------------------------------------------
   Entry
------------------------------------------------ */

runOnce()
  .catch((err) => {
    console.error("[price-alerts] Fatal error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
