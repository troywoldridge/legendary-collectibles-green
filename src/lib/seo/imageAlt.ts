export type AltInput = {
  title?: string | null;
  subtitle?: string | null;
  game?: string | null;        // "pokemon" | "yugioh" | "mtg" | etc.
  setName?: string | null;     // pokemon set name, mtg set, etc.
  cardNumber?: string | null;  // "XY92" or "57" etc
  condition?: string | null;   // "Near Mint"
  isGraded?: boolean | null;
  grader?: string | null;      // "PSA"
  grade?: string | number | null; // "10" or 10
  sealed?: boolean | null;
};

function clean(s: unknown) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function titleCaseGame(game: string) {
  const g = game.toLowerCase();
  if (g === "pokemon") return "Pokémon";
  if (g === "yugioh") return "Yu-Gi-Oh!";
  if (g === "mtg" || g === "magic") return "Magic: The Gathering";
  return game;
}

export function buildImageAlt(input: AltInput): string {
  const title = clean(input.title);
  const subtitle = clean(input.subtitle);
  const gameRaw = clean(input.game);
  const game = gameRaw ? titleCaseGame(gameRaw) : "";

  const setName = clean(input.setName);
  const cardNumber = clean(input.cardNumber);
  const condition = clean(input.condition);

  const isGraded = Boolean(input.isGraded);
  const grader = clean(input.grader);
  const grade = clean(input.grade);

  const sealed = Boolean(input.sealed);

  // Prefer a “base name” that’s not duplicated
  // If subtitle is already condition-like, don't repeat it later.
  const baseParts: string[] = [];
  if (title) baseParts.push(title);

  // Add identifying info (set + number) if available
  const idParts: string[] = [];
  if (setName) idParts.push(setName);
  if (cardNumber) idParts.push(`#${cardNumber}`);

  // Add condition / graded / sealed signals
  const extraParts: string[] = [];

  if (sealed) extraParts.push("Sealed");

  if (isGraded) {
    const slab = [grader || "Graded", grade ? grade : ""].filter(Boolean).join(" ").trim();
    if (slab) extraParts.push(slab);
  } else {
    // Only add condition if not already in title/subtitle
    const combined = `${title} ${subtitle}`.toLowerCase();
    if (condition && !combined.includes(condition.toLowerCase())) {
      extraParts.push(condition);
    }
  }

  // Include game once (helps SEO without being spammy)
  const prefix = game ? `${game} — ` : "";

  const middle = idParts.length ? ` (${idParts.join(" • ")})` : "";
  const tail = extraParts.length ? ` — ${extraParts.join(" • ")}` : "";

  const alt = clean(`${prefix}${baseParts.join(" ")}${middle}${tail}`);
  return alt || "Product image";
}
