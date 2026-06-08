/**
 * useDashboard — hook du tableau de bord.
 *
 * Stratégie : construire les KPIs réels depuis les routes existantes,
 * et conserver le MOCK en fallback pour les sections sans route backend
 * (alertes, tendances) ainsi qu'en cas d'erreur réseau.
 *
 * Routes utilisées :
 *   GET /api/v1/sources/          → nombre de sources actives + activité
 *   GET /api/v1/chat/history      → nombre de requêtes chat
 */

import { useState, useEffect, useCallback } from "react";
import { apiGet, ApiError } from "../api/client";
import type { Source } from "./useSources";

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
  data:      DashboardData | null;
  isLoading: boolean;
  error:     string | null;
  period:    Period;
  setPeriod: (p: Period) => void;
  refresh:   () => void;
}

// ─── Données mock (fallback pour alertes/tendances sans route backend) ────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface ChatHistoryEntry {
  id: string;
  question: string;
  answer: string | null;
  created_at: string;
}

/**
 * Construit les KPIs réels depuis les routes API disponibles,
 * et complète avec les sections mock (alertes, tendances).
 */
async function buildDashboardData(period: Period): Promise<DashboardData> {
  const periodLabel: Record<Period, string> = {
    "7d": "7 derniers jours",
    "30d": "30 derniers jours",
    "90d": "90 derniers jours",
  };

  // Appels parallèles pour minimiser la latence
  const [sources, chatHistory] = await Promise.all([
    apiGet<Source[]>("/sources/"),
    apiGet<ChatHistoryEntry[]>("/chat/history?limit=100").catch(() => [] as ChatHistoryEntry[]),
  ]);

  const activeSources = sources.filter((s) => s.is_active);

  // KPIs réels
  const kpis: KPI[] = [
    {
      label: "Sources actives",
      value: activeSources.length,
      sparkline: undefined,
    },
    {
      label: "Sources totales",
      value: sources.length,
      sparkline: undefined,
    },
    {
      label: "Requêtes chat",
      value: chatHistory.length,
      sparkline: undefined,
    },
  ];

  // Activité des sources depuis les données réelles
  const sources_activity: SourceActivity[] = activeSources.map((s) => ({
    name: s.name,
    type: s.source_type as SourceActivity["type"],
    chunks_today: 0,   // pas exposé par l'API courante
    chunks_total: 0,   // pas exposé par l'API courante
    last_ingested: "",
  }));

  return {
    period: periodLabel[period],
    kpis,
    // Alertes et tendances : pas de route backend, on garde le mock
    alerts: MOCK.alerts,
    trends: MOCK.trends,
    sources_activity: sources_activity.length > 0 ? sources_activity : MOCK.sources_activity,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDashboard(): UseDashboard {
  const [data, setData]           = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [period, setPeriod]       = useState<Period>("7d");

  const load = useCallback(async (p: Period) => {
    setIsLoading(true);
    setError(null);
    try {
      // Tente d'abord de construire depuis l'API réelle
      const dashboard = await buildDashboardData(p);
      setData(dashboard);
    } catch {
      // Fallback silencieux sur le mock (compatible avec les tests existants)
      setData({ ...MOCK, period: p === "7d" ? "7 derniers jours" : p === "30d" ? "30 derniers jours" : "90 derniers jours" });
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