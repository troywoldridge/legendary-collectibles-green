# Legendary Collectibles – Dev Notes

Ad-hoc notes that are useful while working on the project.  
This file can change frequently; it's not user-facing.

---

## 1. Database & Connections

- Primary DB: Neon Postgres
  - Example: `neondb` with user `neondb_owner`
- `DATABASE_URL` used by scripts and app; ensure it matches the same Neon project when debugging.

### Price Alerts Tables

- `price_alerts`:
  - Columns: `id`, `user_id`, `game`, `target_card_id`, `source`, `rule_type`,
    `threshold`, `active`, `created_at`, `fired_at`
- `price_alert_logs`:
  - Columns: `id`, `alert_id`, `user_id`, `game`, `target_card_id`, `source`,
    `rule_type`, `threshold`, `triggered_price`, `triggered_at`, `payload`,
    `fired_at`, `card_id`, `price_when_fired`, `details`, `price`

---

## 2. Scripts

### 2.1 Price Alerts Worker

- File: `scripts/runPriceAlerts.mjs`
- Usage:
  ```bash
  WRITE_HISTORY=1 node scripts/runPriceAlerts.mjs
