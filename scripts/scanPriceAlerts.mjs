 
import "dotenv/config";
import pg from "pg";
import { sendMail } from "../src/lib/mail.js"; // ESM default compile path; adjust if needed

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });

const Q_ALERTS = `
  SELECT id, user_id, game, target_card_id, source, rule_type, threshold, last_triggered_at
  FROM price_alerts
  WHERE active = true
`;

const Q_YGO_PRICE = (source) => `
  SELECT ${source}_price AS price FROM ygo_card_prices WHERE card_id = $1 LIMIT 1
`;

async function getUserEmail(userId) {
  // Clerk: fetch via JWT or your users table if mirrored. For now, send to a placeholder
  // If you mirror users, replace this with a real lookup.
  return `${userId}@example.com`;
}

async function runOnce() {
  const client = await pool.connect();
  try {
    const { rows: alerts } = await client.query(Q_ALERTS);

    for (const a of alerts) {
      if (a.game !== "yugioh") continue; // extend later

      const src = String(a.source).toLowerCase();
      const { rows: pr } = await client.query(Q_YGO_PRICE(src), [a.target_card_id]);
      const price = pr?.[0]?.price == null ? null : Number(pr[0].price);

      if (price == null || isNaN(price)) continue;

      const shouldTrigger =
        (a.rule_type === "above" && price > Number(a.threshold)) ||
        (a.rule_type === "below" && price < Number(a.threshold));

      if (!shouldTrigger) continue;

      const to = await getUserEmail(a.user_id);
      const subject = `Price alert (${a.game.toUpperCase()} ${a.source} ${a.rule_type} ${a.threshold})`;
      const html = `
        <p>Your alert fired:</p>
        <ul>
          <li>Game: <b>${a.game}</b></li>
          <li>Card ID: <b>${a.target_card_id}</b></li>
          <li>Source: <b>${a.source}</b></li>
          <li>Rule: <b>${a.rule_type} ${a.threshold}</b></li>
          <li>Current Price: <b>$${price.toFixed(2)}</b></li>
        </ul>
      `;

      try {
        await sendMail({ to, subject, html, text: subject });
        await client.query(
          `UPDATE price_alerts SET last_triggered_at = NOW() WHERE id = $1`,
          [a.id]
        );
        console.log(`Sent alert ${a.id} -> ${to}`);
      } catch (err) {
        console.error(`Mail failed for alert ${a.id}:`, err.message);
      }
    }
  } finally {
    client.release();
  }
}

runOnce().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
