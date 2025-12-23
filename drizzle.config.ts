// drizzle.config.ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",

  // Where drizzle-kit will write:
  // - migrations (.sql)
  // - snapshots
  // - schema.ts + relations.ts from `drizzle-kit pull`
  out: "./drizzle",

  // This is the schema *input* for generate (your app schema files)
  // We'll point it to the pulled schema after we generate it the first time.
  schema: "./drizzle/schema.ts",

  dbCredentials: {
    // put your real env var name here (see below)
    url: process.env.DATABASE_URL!,
  },

  // Optional but helpful
  strict: true,
  verbose: true,
});
