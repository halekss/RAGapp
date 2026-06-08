import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Period = "7d" | "30d" | "90d";

export interface KPI {
  label: string;
  value: number;
  unit?: string;
  delta?: number;
  sparkline?: number[];
}

export interface Alert {
  id: string;
  title: string;
  summary: string;
  source: string;
  published_at: string;
  severity: "high" | "medium" | "low";
  tags: string[];
}

export interface Trend {
  topic: string;
  count: number;
  delta: number;
  sources: string[];
}

export interface SourceActivity {
  name: string;
  type: "rss" | "scraper" | "pdf";
  chunks_today: number;
  chunks_total: number;
  last_ingested: string;
}

export interface DashboardData {
  kpis: KPI[];
  alerts: Alert[];
  trends: Trend[];
  sources_activity: SourceActivity[];
  period: string;
}

export interface UseDashboard {
  data:       DashboardData | null;
  isLoading:  boolean;
  error:      string | null;
  period:     Period;
  setPeriod:  (p: Period) => void;
  refresh:    () => void;
}

// ─── Données mock (dev / fallback) ───────────────────────────────────────────

const MOCK: DashboardData = {
  period: "7 derniers jours",
  kpis: [
    { label: "Documents ingérés", value: 1284, delta: 12.4,  sparkline: [80, 95, 112, 104, 130, 158, 190] },
    { label: "Chunks indexés",    value: 38420, delta: 9.1,  sparkline: [4200, 4800, 5100, 4900, 5600, 6200, 7100] },
    { label: "Signaux détectés",  value: 47,    delta: -3.2, sparkline: [8, 5, 9, 7, 6, 8, 4] },
    { label: "Sources actives",   value: 12,                 sparkline: [10, 10, 11, 11, 12, 12, 12] },
  ],
  alerts: [
    {
      id: "1", severity: "high",
      title: "Lancement produit concurrent annoncé",
      summary: "Un concurrent majeur a annoncé un lancement de gamme directement positionné sur votre segment premium, prévu pour le T3.",
      source: "TechCrunch", published_at: "2025-06-04T09:14:00Z",
      tags: ["lancement", "concurrent", "premium"],
    },
    {
      id: "2", severity: "high",
      title: "Réduction tarifaire de 20% observée",
      summary: "Baisse significative des prix détectée chez deux acteurs du marché, potentiellement déclenchée par une guerre des prix.",
      source: "Newsroom Acme", published_at: "2025-06-03T14:30:00Z",
      tags: ["prix", "stratégie"],
    },
    {
      id: "3", severity: "medium",
      title: "Recrutement massif en R&D",
      summary: "Vingt-trois postes d'ingénieurs ouverts simultanément, suggérant une accélération du développement produit.",
      source: "LinkedIn Scraper", published_at: "2025-06-02T08:00:00Z",
      tags: ["RH", "R&D"],
    },
    {
      id: "4", severity: "low",
      title: "Partenariat distribution annoncé",
      summary: "Accord de distribution élargi avec un réseau retail européen, renforçant leur présence B2C.",
      source: "Communiqué de presse", published_at: "2025-06-01T16:45:00Z",
      tags: ["distribution", "Europe"],
    },
  ],
  trends: [
    { topic: "Intelligence artificielle générative", count: 142, delta: 34,  sources: ["TechCrunch", "The Verge", "Wired", "MIT Tech Review"] },
    { topic: "Tarification dynamique",               count: 87,  delta: 18,  sources: ["Reuters", "Bloomberg"] },
    { topic: "Expansion marché asiatique",           count: 64,  delta: -5,  sources: ["FT", "Nikkei"] },
    { topic: "Réglementation IA Europe",             count: 58,  delta: 22,  sources: ["Politico", "Euractiv", "Le Monde"] },
    { topic: "Fusions-acquisitions secteur",         count: 41,  delta: 7,   sources: ["WSJ", "Bloomberg"] },
  ],
  sources_activity: [
    { name: "TechCrunch RSS",        type: "rss",     chunks_today: 48, chunks_total: 12400, last_ingested: "2025-06-05T06:00:00Z" },
    { name: "Newsroom Acme Corp",    type: "scraper", chunks_today: 12, chunks_total: 3200,  last_ingested: "2025-06-05T05:45:00Z" },
    { name: "Rapports annuels 2024", type: "pdf",     chunks_today: 0,  chunks_total: 8900,  last_ingested: "2025-06-01T10:20:00Z" },
    { name: "Reuters Tech",          type: "rss",     chunks_today: 31, chunks_total: 9100,  last_ingested: "2025-06-05T06:00:00Z" },
    { name: "Veille LinkedIn",       type: "scraper", chunks_today: 7,  chunks_total: 1800,  last_ingested: "2025-06-04T22:00:00Z" },
  ],
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDashboard(): UseDashboard {
  const [data, setData]       = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [period, setPeriod]   = useState<Period>("7d");

  const load = useCallback(async (p: Period) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard?period=${p}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: DashboardData = await res.json();
      setData(json);
    } catch {
      // Fallback sur mock en dev
      setData(MOCK);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load(period);
  }, [period, load]);

  const refresh = useCallback(() => load(period), [period, load]);

  return { data, isLoading, error, period, setPeriod, refresh };
}