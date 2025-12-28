export const FEATURES = {
  sportsCards: process.env.NEXT_PUBLIC_FEATURE_SPORTS === "1",
  funko: process.env.NEXT_PUBLIC_FEATURE_FUNKO === "1",
} as const;
