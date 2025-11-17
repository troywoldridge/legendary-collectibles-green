// src/lib/db/schema/index.ts
// Re-export every table module that should be part of the Drizzle schema.
// Add your existing modules here too (pokemon, ygo, mtg, etc).

export * from "./billing";      // <-- exposes plans, userPlans, billingCustomers
export * from "./mtg";          // (example) your MTG tables
export * from "./pricecharting";
export * from "@/lib/db/schema/pro";
export * from "@/lib/db/schema/collectionAnalytics";


