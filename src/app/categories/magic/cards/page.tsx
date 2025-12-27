import { redirect } from "next/navigation";

export default function MagicCardsRedirect() {
  redirect("/categories/mtg/cards");
}
