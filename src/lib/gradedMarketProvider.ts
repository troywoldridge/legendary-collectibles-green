export type GradeLadder = {
  currency: string;
  rawCents?: number | null;
  psa: Partial<Record<1|2|3|4|5|6|7|8|9|10, number | null>>;
  sourceUpdatedAt?: string | null;
};

export interface GradedMarketProvider {
  fetchPsaLadder(params: { game: string; cardId: string; currency?: string }): Promise<GradeLadder | null>;
}
