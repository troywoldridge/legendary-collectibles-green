import { redirect } from "next/navigation";

export default function StoreGameRedirectPage({
  params,
}: {
  params: { game: string };
}) {
  const game = String(params.game || "").toLowerCase();

  // Map legacy game slugs → new department slugs
  const map: Record<string, string> = {
    pokemon: "pokemon",
    pokémon: "pokemon",
    mtg: "mtg",
    magic: "mtg",
    "magic-the-gathering": "mtg",
    yugioh: "yugioh",
    "yu-gi-oh": "yugioh",
    ygo: "yugioh",
    sports: "sports",
    funko: "funko",
  };

  const dept = map[game] ?? game; // fallback to same slug
  redirect(`/shop/${dept}`);
}
