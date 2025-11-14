"use client";

import { useEffect, useState } from "react";

type ByGameEntry = {
  quantity: number;
  valueCents: number;
};

type Summary = {
  totalQuantity: number;
  distinctItems: number;
  totalCostCents: number;
  totalValueCents: number;
  byGame: Record<string, ByGameEntry>;
};

type HistoryPoint = {
  date: string; // YYYY-MM-DD
  totalValueCents: number;
  totalCostCents: number;
  totalQuantity: number;
};

type RecentlyAddedItem = {
  id: string;
  game: string | null;
  cardId: string | null;
  cardName: string | null;
  setName: string | null;
  imageUrl: string | null;
  quantity: number;
  lastValueCents: number | null;
  createdAt: string | Date;
};

type DashboardResponse = {
  summary: Summary;
  history: HistoryPoint[];
  recentlyAdded: RecentlyAddedItem[];
};

type State = {
  loading: boolean;
  error: string | null;
  summary: Summary | null;
  history: HistoryPoint[];
  recentlyAdded: RecentlyAddedItem[];
};

export function useCollectionDashboard(): State {
  const [state, setState] = useState<State>({
    loading: true,
    error: null,
    summary: null,
    history: [],
    recentlyAdded: [],
  });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        setState((s) => ({ ...s, loading: true, error: null }));

        const res = await fetch("/api/collection/dashboard", {
          method: "GET",
          headers: { "Accept": "application/json" },
        });

        if (!res.ok) {
          // 401s etc.
          const text = await res.text().catch(() => "");
          if (!cancelled) {
            setState((s) => ({
              ...s,
              loading: false,
              error: `HTTP ${res.status} ${text || ""}`.trim(),
            }));
          }
          return;
        }

        const data = (await res.json()) as DashboardResponse;

        if (!cancelled) {
          setState({
            loading: false,
            error: null,
            summary: data.summary ?? null,
            history: data.history ?? [],
            recentlyAdded: data.recentlyAdded ?? [],
          });
        }
      } catch (err) {
        console.error("useCollectionDashboard failed", err);
        if (!cancelled) {
          setState((s) => ({
            ...s,
            loading: false,
            error: "Failed to load dashboard data.",
          }));
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
