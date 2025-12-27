import "dotenv/config";
import pg from "pg";
import { sendMail } from "../src/lib/mail.ts"; // ts path exists in repo

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

const Q_ALERTS = `
  SELECT id, user_id, game, target_card_id, source, rule_type, threshold
  FROM price_alerts
  WHERE active = true
`;

const Q_YGO_PRICE = (src) => `
  SELECT ${src}_price AS price
  FROM ygo_card_prices
  WHERE card_id = $1
  LIMIT 1
`;

function safeSource(src) {
  const s = String(src || "").toLowerCase();
  // lock down to known columns to prevent SQL injection via column name
  const allowed = new Set(["tcgplayer", "ebay", "market", "cardmarket"]);
  return allowed.has(s) ? s : "market";
}

async function getUserEmail(userId) {
  // TODO: replace with your real users lookup
  return `${userId}@example.com`;
}

async function runOnce() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL not set");
  }

  const client = await pool.connect();
  try {
    const { rows: alerts } = await client.query(Q_ALERTS);

    for (const a of alerts) {
      if (a.game !== "yugioh") continue;

      const src = safeSource(a.source);
      const { rows: pr } = await client.query(Q_YGO_PRICE(src), [a.target_card_id]);
      const price = pr?.[0]?.price == null ? null : Number(pr[0].price);
      if (price == null || Number.isNaN(price)) continue;

      const threshold = Number(a.threshold);
      const shouldTrigger =
        (a.rule_type === "above" && price > threshold) ||
        (a.rule_type === "below" && price < threshold);

      if (!shouldTrigger) continue;

      const to = await getUserEmail(a.user_id);
      const subject = `Price alert (${a.game.toUpperCase()} ${src} ${a.rule_type} ${threshold})`;
      const html = `
        <p>Your alert fired:</p>
        <ul>
          <li>Game: <b>${a.game}</b></li>
          <li>Card ID: <b>${a.target_card_id}</b></li>
          <li>Source: <b>${src}</b></li>
          <li>Rule: <b>${a.rule_type} ${threshold}</b></li>
          <li>Current Price: <b>$${price.toFixed(2)}</b></li>
        </ul>
      `;

      await sendMail({ to, subject, html, text: subject });

      await client.query(`UPDATE price_alerts SET last_triggered_at = NOW() WHERE id = $1`, [a.id]);
      console.log(`Sent alert ${a.id} -> ${to}`);
    }
  } finally {
    client.release();
  }
}

runOnce()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
