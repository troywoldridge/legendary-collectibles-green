// src/lib/db/schema/index.ts

export * from "./enums"; // ✅ only enums here (gameEnum, etc.)

export * from "./billing";
export * from "./mtg";
export * from "./pricecharting";
export * from "./collectionAnalytics";
export * from "./priceAlertLogs";
export * from "./priceAlerts";

export * from "./store";
export * from "./inventory";
export * from "./orders";
export * from "./cart";
export * from "./shop";



// 🚫 DO NOT export * from "./pro" if pro re-exports gameEnum
// Instead: export only the tables you need from pro:
export { pro_exports } from "./pro";
export * from "./emailEvents";
export { categories, subcategories } from "./schema";
export * from "./vendorMaps";

