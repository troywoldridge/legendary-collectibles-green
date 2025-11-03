import "dotenv/config";
import { Pool } from "pg";
import { setTimeout as delay } from "timers/promises";

const pg = new Pool({ connectionString: process.env.DATABASE_URL });
const USE_CF = !!process.env.CF_DIRECT_UPLOAD_URL && !!process.env.CF_DIRECT_UPLOAD_TOKEN;

async function cfMirror(originalUrl) {
  if (!USE_CF) return { cfId: null };
  const res = await fetch(process.env.CF_DIRECT_UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.CF_DIRECT_UPLOAD_TOKEN}` },
    body: JSON.stringify({ url: originalUrl }),
  });
  if (!res.ok) return { cfId: null };
  const data = await res.json().catch(() => ({}));
  const cfId = data?.result?.id || data?.id || null;
  return { cfId };
}

function hasImage(row) {
  return !!(row.image && row.image.trim() !== "");
}

async function findCandidate(pop) {
  // 1) Try number + title similarity
  // 2) Else title similarity
  const { rows } = await pg.query(`
    WITH cand AS (
      SELECT
        fpr.url,
        fpr.title,
        fpr.image_primary,
        fpr.images,
        fpr.number,
        similarity(fpr.title, $1) AS sim
      FROM funko_products_raw fpr
      WHERE fpr.image_primary IS NOT NULL
      ORDER BY
        (CASE WHEN fpr.number IS NOT NULL AND fpr.number = $2 THEN 1 ELSE 0 END) DESC,
        sim DESC
      LIMIT 5
    )
    SELECT * FROM cand WHERE sim >= 0.45
    ORDER BY (CASE WHEN number = $2 THEN 1 ELSE 0 END) DESC, sim DESC
    LIMIT 1;
  `, [pop.title || pop.handle, pop.number || null]);

  return rows[0] || null;
}

async function main() {
  console.log("→ Matching staged Funko images into funko_pops …");
  // Pull a batch of pops missing images
  const { rows: pops } = await pg.query(`
    SELECT id, handle, title, number
    FROM funko_pops
    WHERE (image IS NULL OR image = '')
    ORDER BY id ASC
    LIMIT 1000
  `);

  for (const pop of pops) {
    const cand = await findCandidate(pop);
    if (!cand) {
      console.log(`• no match: ${pop.id} ${pop.title || pop.handle}`);
      continue;
    }

    let image = cand.image_primary;
    if (!image && Array.isArray(cand.images) && cand.images.length) image = cand.images[0];
    if (!image) {
      console.log(`• no image on candidate: ${pop.id}`);
      continue;
    }

    let provider = "funko.com";
    // Optional mirror to CF
    if (USE_CF) {
      const { cfId } = await cfMirror(image);
      if (cfId) {
        image = `cf:${cfId}`;
        provider = "funko.com+cf";
      }
    }

    await pg.query(`
      UPDATE funko_pops
      SET image = $1,
          image_large = COALESCE(image_large, $1),
          external_url = $2,
          img_provider = $3,
          img_found_at = NOW()
      WHERE id = $4
    `, [image, cand.url, provider, pop.id]);

    console.log(`✓ ${pop.id} ← ${provider} (${cand.url})`);
    await delay(150);
  }

  await pg.end();
  console.log("✓ Done.");
}

main().catch(async (e) => {
  console.error("✗ Match failed:", e);
  await pg.end().catch(()=>{});
  process.exit(1);
});
