import "server-only";

// Server component (no "use client")
type CardBasics = {
  id: string;
  name?: string | null;
  number?: string | null;
  set_code?: string | null;
  set_name?: string | null;
};

type Props = {
  card: CardBasics;
  game: string;
  /** Visual style: "button" (default) or "pill" */
  variant?: "button" | "pill";
  /** Back-compat: when true, renders a smaller pill-style button */
  compact?: boolean;
  className?: string;
};

export default function CardEbayCTA(_props: Props) {
  return null;
}
