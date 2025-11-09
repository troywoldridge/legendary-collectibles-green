// src/app/categories/funko/template.tsx
import { notFound } from "next/navigation";
import { FEATURES } from "@/config/flags";

export default function FunkoGate({ children }: { children: React.ReactNode }) {
  if (!FEATURES.funko) notFound(); // hard 404 for everything under /categories/funko
  return children;
}
