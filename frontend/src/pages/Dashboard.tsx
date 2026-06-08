import { useState, useEffect, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface KPI {
  label: string;
  value: number;
  unit?: string;
  delta?: number;       // % d'évolution vs période précédente
  sparkline?: number[]; // 7 dernières valeurs
}

interface Alert {
  id: string;
  title: string;
  summary: string;
  source: string;
  published_at: string;
  severity: "high" | "medium" | "low";
  tags: string[];
}

interface Trend {
  topic: string;
  count: number;
  delta: number;
  sources: string[];
}

interface SourceActivity {
  name: string;
  type: "rss" | "scraper" | "pdf";
  chunks_today: number;
  chunks_total: number;
  last_ingested: string;
}

interface DashboardData {
  kpis: KPI[];
  alerts: Alert[];
  trends: Trend[];
  sources_activity: SourceActivity[];
  period: string;
}

// ─── Utilitaires ─────────────────────────────────────────────────────────────

const TYPE_COLORS = { rss: "#c9a84c", scraper: "#7eb8a4", pdf: "#a47eb8" };
const SEV_CONFIG = {
  high:   { label: "Critique", color: "#e06060", bg: "rgba(224,96,96,0.12)",   border: "rgba(224,96,96,0.25)" },
  medium: { label: "Modéré",   color: "#c9a84c", bg: "rgba(201,168,76,0.12)", border: "rgba(201,168,76,0.25)" },
  low:    { label: "Faible",   color: "#7eb8a4", bg: "rgba(126,184,164,0.12)",border: "rgba(126,184,164,0.25)" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function formatDelta(d: number) {
  return (d >= 0 ? "+" : "") + d.toFixed(1) + "%";
}

// ─── Sparkline SVG ────────────────────────────────────────────────────────────

function Sparkline({ data, color = "#c9a84c" }: { data: number[]; color?: string }) {
  if (!data || data.length < 2) return null;
  const w = 64, h = 24, pad = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });
  const polyline = pts.join(" ");
  const areaPath = `M${pts[0]} L${pts.join(" L")} L${w - pad},${h} L${pad},${h} Z`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
      <defs>
        <linearGradient id={`sg-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#sg-${color.replace("#","")})`} />
      <polyline points={polyline} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1].split(",")[0]} cy={pts[pts.length - 1].split(",")[1]} r="2.5" fill={color} />
    </svg>
  );
}

// ─── Compteur animé ───────────────────────────────────────────────────────────

function AnimatedCount({ target, duration = 900 }: { target: number; duration?: number }) {
  const [val, setVal] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    function tick(now: number) {
      const p = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(ease * target));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return <>{val.toLocaleString("fr-FR")}</>;
}

// ─── Barre de progression ─────────────────────────────────────────────────────

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="prog-track">
      <div
        className="prog-fill"
        style={{ width: `${pct}%`, background: color }}
      />
    </div>
  );
}

// ─── Carte KPI ────────────────────────────────────────────────────────────────

function KPICard({ kpi, index }: { kpi: KPI; index: number }) {
  const positive = kpi.delta !== undefined ? kpi.delta >= 0 : null;
  return (
    <div className="kpi-card" style={{ animationDelay: `${index * 80}ms` }}>
      <div className="kpi-header">
        <span className="kpi-label">{kpi.label}</span>
        {kpi.delta !== undefined && (
          <span className={`kpi-delta ${positive ? "kpi-delta--up" : "kpi-delta--down"}`}>
            {positive ? "↑" : "↓"} {formatDelta(Math.abs(kpi.delta))}
          </span>
        )}
      </div>
      <div className="kpi-body">
        <span className="kpi-value">
          <AnimatedCount target={kpi.value} />
          {kpi.unit && <span className="kpi-unit">{kpi.unit}</span>}
        </span>
        {kpi.sparkline && (
          <Sparkline data={kpi.sparkline} color={positive === false ? "#e06060" : "#c9a84c"} />
        )}
      </div>
    </div>
  );
}

// ─── Carte alerte ─────────────────────────────────────────────────────────────

function AlertCard({ alert, index }: { alert: Alert; index: number }) {
  const cfg = SEV_CONFIG[alert.severity];
  return (
    <div
      className="alert-card"
      style={{
        borderColor: cfg.border,
        animationDelay: `${index * 60 + 200}ms`,
      }}
    >
      <div className="alert-sev" style={{ background: cfg.bg, color: cfg.color }}>
        {cfg.label}
      </div>
      <div className="alert-body">
        <p className="alert-title">{alert.title}</p>
        <p className="alert-summary">{alert.summary}</p>
        <div className="alert-meta">
          <span className="alert-source">{alert.source}</span>
          <span className="alert-date">{formatDate(alert.published_at)}</span>
        </div>
        {alert.tags.length > 0 && (
          <div className="alert-tags">
            {alert.tags.map((t) => (
              <span key={t} className="tag">{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("7d");
  const [severityFilter, setSeverityFilter] = useState<"all" | "high" | "medium" | "low">("all");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/dashboard?period=${period}`);
        const json: DashboardData = await res.json();
        setData(json);
      } catch {
        // Fallback avec données fictives pour le dev
        setData(MOCK_DATA);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [period]);

  const filteredAlerts = data?.alerts.filter(
    (a) => severityFilter === "all" || a.severity === severityFilter
  ) ?? [];

  const maxChunks = Math.max(...(data?.sources_activity.map((s) => s.chunks_total) ?? [1]));

  return (
    <>
      <style>{CSS}</style>
      <div className="dash-root">

        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="brand-mark">
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <span className="brand-name">Veille</span>
          </div>

          <nav className="sidebar-nav">
            <a href="/chat" className="nav-item">
              <svg viewBox="0 0 20 20" fill="none">
                <path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H6l-4 3V5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
              <span>Chat</span>
            </a>
            <a href="/dashboard" className="nav-item nav-item--active">
              <svg viewBox="0 0 20 20" fill="none">
                <rect x="2" y="10" width="4" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="8" y="6" width="4" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="14" y="2" width="4" height="16" rx="1" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <span>Dashboard</span>
            </a>
            <a href="/admin" className="nav-item">
              <svg viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span>Admin</span>
            </a>
          </nav>

          <div className="sidebar-footer">
            <div className="client-badge">
              <span className="client-dot" />
              <span className="client-name">Client actif</span>
            </div>
          </div>
        </aside>

        {/* Contenu */}
        <main className="dash-main">
          <header className="dash-header">
            <div>
              <h1 className="dash-title">Dashboard</h1>
              <span className="dash-subtitle">
                Synthèse · {data?.period ?? "Chargement…"}
              </span>
            </div>
            <div className="period-selector">
              {(["7d", "30d", "90d"] as const).map((p) => (
                <button
                  key={p}
                  className={`period-btn ${period === p ? "period-btn--active" : ""}`}
                  onClick={() => setPeriod(p)}
                >
                  {p === "7d" ? "7 jours" : p === "30d" ? "30 jours" : "90 jours"}
                </button>
              ))}
            </div>
          </header>

          {loading ? (
            <div className="dash-loading">
              <span className="spinner" />
              <span>Chargement du tableau de bord…</span>
            </div>
          ) : (
            <div className="dash-scroll">

              {/* ── KPIs ── */}
              <section className="kpi-grid">
                {data!.kpis.map((kpi, i) => (
                  <KPICard key={kpi.label} kpi={kpi} index={i} />
                ))}
              </section>

              {/* ── Grille principale ── */}
              <div className="main-grid">

                {/* Colonne gauche : alertes */}
                <div className="col-alerts">
                  <div className="section-head">
                    <h2 className="section-title">
                      <span className="section-dot section-dot--red" />
                      Signaux détectés
                    </h2>
                    <div className="sev-filters">
                      {(["all", "high", "medium", "low"] as const).map((s) => (
                        <button
                          key={s}
                          className={`sev-btn ${severityFilter === s ? "sev-btn--active" : ""}`}
                          style={severityFilter === s && s !== "all" ? {
                            color: SEV_CONFIG[s].color,
                            borderColor: SEV_CONFIG[s].border,
                            background: SEV_CONFIG[s].bg,
                          } : {}}
                          onClick={() => setSeverityFilter(s)}
                        >
                          {s === "all" ? "Tous" : SEV_CONFIG[s].label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredAlerts.length === 0 ? (
                    <div className="empty-panel">
                      <svg viewBox="0 0 32 32" fill="none">
                        <path d="M16 4a12 12 0 100 24A12 12 0 0016 4z" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M16 10v6M16 20v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                      <p>Aucun signal sur cette période</p>
                    </div>
                  ) : (
                    <div className="alerts-list">
                      {filteredAlerts.map((a, i) => (
                        <AlertCard key={a.id} alert={a} index={i} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Colonne droite */}
                <div className="col-right">

                  {/* Tendances */}
                  <div className="panel">
                    <div className="section-head">
                      <h2 className="section-title">
                        <span className="section-dot section-dot--amber" />
                        Tendances
                      </h2>
                    </div>
                    <div className="trends-list">
                      {data!.trends.map((t, i) => (
                        <div key={t.topic} className="trend-row" style={{ animationDelay: `${i * 50 + 300}ms` }}>
                          <div className="trend-rank">{i + 1}</div>
                          <div className="trend-info">
                            <div className="trend-topic-row">
                              <span className="trend-topic">{t.topic}</span>
                              <span className={`trend-delta ${t.delta >= 0 ? "trend-delta--up" : "trend-delta--down"}`}>
                                {t.delta >= 0 ? "↑" : "↓"} {Math.abs(t.delta)}%
                              </span>
                            </div>
                            <div className="trend-sources">
                              {t.sources.slice(0, 3).map((s) => (
                                <span key={s} className="trend-source-chip">{s}</span>
                              ))}
                              {t.sources.length > 3 && (
                                <span className="trend-source-chip trend-source-chip--more">+{t.sources.length - 3}</span>
                              )}
                            </div>
                          </div>
                          <span className="trend-count">{t.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Activité des sources */}
                  <div className="panel">
                    <div className="section-head">
                      <h2 className="section-title">
                        <span className="section-dot section-dot--teal" />
                        Activité des sources
                      </h2>
                    </div>
                    <div className="sources-activity">
                      {data!.sources_activity.map((s, i) => (
                        <div key={s.name} className="sa-row" style={{ animationDelay: `${i * 50 + 400}ms` }}>
                          <div className="sa-header">
                            <div className="sa-name-row">
                              <span
                                className="sa-type-dot"
                                style={{ background: TYPE_COLORS[s.type] }}
                                title={s.type}
                              />
                              <span className="sa-name">{s.name}</span>
                            </div>
                            <div className="sa-counts">
                              <span className="sa-today">+{s.chunks_today}</span>
                              <span className="sa-total">{s.chunks_total.toLocaleString("fr-FR")} total</span>
                            </div>
                          </div>
                          <ProgressBar
                            value={s.chunks_total}
                            max={maxChunks}
                            color={TYPE_COLORS[s.type]}
                          />
                          <span className="sa-date">{formatDate(s.last_ingested)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}

// ─── Données mock pour le développement ──────────────────────────────────────

const MOCK_DATA: DashboardData = {
  period: "7 derniers jours",
  kpis: [
    { label: "Documents ingérés", value: 1284, delta: 12.4, sparkline: [80, 95, 112, 104, 130, 158, 190] },
    { label: "Chunks indexés",    value: 38420, delta: 9.1,  sparkline: [4200, 4800, 5100, 4900, 5600, 6200, 7100] },
    { label: "Signaux détectés",  value: 47,    delta: -3.2, sparkline: [8, 5, 9, 7, 6, 8, 4] },
    { label: "Sources actives",   value: 12,    sparkline: [10, 10, 11, 11, 12, 12, 12] },
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
    { topic: "Intelligence artificielle générative", count: 142, delta: 34, sources: ["TechCrunch", "The Verge", "Wired", "MIT Tech Review"] },
    { topic: "Tarification dynamique",               count: 87,  delta: 18, sources: ["Reuters", "Bloomberg"] },
    { topic: "Expansion marché asiatique",           count: 64,  delta: -5, sources: ["FT", "Nikkei"] },
    { topic: "Réglementation IA Europe",             count: 58,  delta: 22, sources: ["Politico", "Euractiv", "Le Monde"] },
    { topic: "Fusions-acquisitions secteur",         count: 41,  delta: 7,  sources: ["WSJ", "Bloomberg"] },
  ],
  sources_activity: [
    { name: "TechCrunch RSS",        type: "rss",     chunks_today: 48,  chunks_total: 12400, last_ingested: "2025-06-05T06:00:00Z" },
    { name: "Newsroom Acme Corp",    type: "scraper", chunks_today: 12,  chunks_total: 3200,  last_ingested: "2025-06-05T05:45:00Z" },
    { name: "Rapports annuels 2024", type: "pdf",     chunks_today: 0,   chunks_total: 8900,  last_ingested: "2025-06-01T10:20:00Z" },
    { name: "Reuters Tech",          type: "rss",     chunks_today: 31,  chunks_total: 9100,  last_ingested: "2025-06-05T06:00:00Z" },
    { name: "Veille LinkedIn",       type: "scraper", chunks_today: 7,   chunks_total: 1800,  last_ingested: "2025-06-04T22:00:00Z" },
  ],
};

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');

  :root {
    --bg-base:     #0e0e0f;
    --bg-surface:  #141415;
    --bg-elevated: #1a1a1c;
    --bg-hover:    #202023;
    --border:      rgba(255,255,255,0.07);
    --border-hover:rgba(255,255,255,0.14);
    --text-primary:  #e8e6e0;
    --text-secondary:#8a8780;
    --text-muted:    #4a4845;
    --accent:      #c9a84c;
    --accent-dim:  rgba(201,168,76,0.15);
    --radius:      12px;
    --radius-sm:   8px;
    --sidebar-w:   220px;
    --font-serif:  'DM Serif Display', Georgia, serif;
    --font-body:   'DM Sans', sans-serif;
    --font-mono:   'DM Mono', monospace;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  .dash-root {
    display: flex; height: 100vh; overflow: hidden;
    background: var(--bg-base); color: var(--text-primary);
    font-family: var(--font-body); font-size: 14px; line-height: 1.6;
  }

  /* ── Sidebar ── */
  .sidebar {
    width: var(--sidebar-w); min-width: var(--sidebar-w);
    background: var(--bg-surface); border-right: 1px solid var(--border);
    display: flex; flex-direction: column; padding: 24px 16px; gap: 8px;
  }
  .sidebar-header {
    display: flex; align-items: center; gap: 10px;
    padding: 0 4px 20px; border-bottom: 1px solid var(--border); margin-bottom: 8px;
  }
  .brand-mark { width: 32px; height: 32px; color: var(--accent); flex-shrink: 0; }
  .brand-mark svg { width: 100%; height: 100%; }
  .brand-name { font-family: var(--font-serif); font-size: 18px; color: var(--text-primary); letter-spacing: 0.02em; }
  .sidebar-nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
  .nav-item {
    display: flex; align-items: center; gap: 10px; padding: 9px 12px;
    border-radius: var(--radius-sm); color: var(--text-secondary);
    text-decoration: none; font-size: 13.5px;
    transition: background 0.18s ease, color 0.18s ease; position: relative;
  }
  .nav-item svg { width: 16px; height: 16px; flex-shrink: 0; }
  .nav-item:hover { background: var(--bg-hover); color: var(--text-primary); }
  .nav-item--active { background: var(--accent-dim); color: var(--accent); }
  .nav-item--active::before {
    content: ''; position: absolute; left: 0; top: 6px; bottom: 6px;
    width: 2px; background: var(--accent); border-radius: 2px;
  }
  .sidebar-footer { border-top: 1px solid var(--border); padding-top: 16px; }
  .client-badge { display: flex; align-items: center; gap: 7px; padding: 0 4px; }
  .client-dot { width: 6px; height: 6px; border-radius: 50%; background: #4caf78; box-shadow: 0 0 6px rgba(76,175,120,0.5); }
  .client-name { font-size: 12px; color: var(--text-secondary); font-family: var(--font-mono); }

  /* ── Main ── */
  .dash-main { flex: 1; display: flex; flex-direction: column; min-width: 0; overflow: hidden; }

  .dash-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 20px 28px 18px; border-bottom: 1px solid var(--border);
    background: var(--bg-base); flex-shrink: 0;
  }
  .dash-title { font-family: var(--font-serif); font-size: 20px; font-weight: 400; color: var(--text-primary); letter-spacing: 0.01em; }
  .dash-subtitle { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); letter-spacing: 0.04em; }

  .period-selector { display: flex; gap: 3px; }
  .period-btn {
    padding: 5px 12px; border-radius: 20px;
    background: transparent; border: 1px solid var(--border);
    color: var(--text-secondary); font-size: 12.5px; cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    font-family: var(--font-body);
  }
  .period-btn:hover { background: var(--bg-elevated); color: var(--text-primary); }
  .period-btn--active { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }

  .dash-scroll { flex: 1; overflow-y: auto; padding: 24px 28px; scrollbar-width: thin; scrollbar-color: var(--bg-elevated) transparent; }
  .dash-scroll::-webkit-scrollbar { width: 5px; }
  .dash-scroll::-webkit-scrollbar-thumb { background: var(--bg-elevated); border-radius: 3px; }

  .dash-loading {
    flex: 1; display: flex; align-items: center; justify-content: center;
    gap: 12px; color: var(--text-secondary); font-size: 13px;
  }

  /* ── KPI grid ── */
  .kpi-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px; margin-bottom: 20px;
  }
  @media (max-width: 1100px) { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }

  .kpi-card {
    background: var(--bg-surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 16px 18px;
    transition: border-color 0.2s ease, transform 0.2s ease;
    animation: card-in 0.35s ease both;
  }
  @keyframes card-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
  .kpi-card:hover { border-color: var(--border-hover); transform: translateY(-1px); }

  .kpi-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
  .kpi-label { font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-muted); }
  .kpi-delta { font-family: var(--font-mono); font-size: 11px; padding: 1px 6px; border-radius: 4px; }
  .kpi-delta--up   { color: #4caf78; background: rgba(76,175,120,0.12); }
  .kpi-delta--down { color: #e06060; background: rgba(224,96,96,0.12); }

  .kpi-body { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; }
  .kpi-value { font-family: var(--font-serif); font-size: 28px; color: var(--text-primary); line-height: 1; }
  .kpi-unit { font-family: var(--font-body); font-size: 13px; color: var(--text-secondary); margin-left: 4px; }

  /* ── Grille principale ── */
  .main-grid {
    display: grid;
    grid-template-columns: 1fr 380px;
    gap: 16px; align-items: start;
  }
  @media (max-width: 1200px) { .main-grid { grid-template-columns: 1fr; } }

  /* ── En-têtes de sections ── */
  .section-head {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 12px; flex-wrap: wrap; gap: 8px;
  }
  .section-title {
    font-family: var(--font-serif); font-size: 15px; font-weight: 400;
    color: var(--text-primary); display: flex; align-items: center; gap: 8px;
  }
  .section-dot { width: 7px; height: 7px; border-radius: 50%; }
  .section-dot--red   { background: #e06060; box-shadow: 0 0 6px rgba(224,96,96,0.5); }
  .section-dot--amber { background: #c9a84c; box-shadow: 0 0 6px rgba(201,168,76,0.5); }
  .section-dot--teal  { background: #7eb8a4; box-shadow: 0 0 6px rgba(126,184,164,0.5); }

  /* ── Filtres sévérité ── */
  .sev-filters { display: flex; gap: 4px; }
  .sev-btn {
    padding: 3px 9px; border-radius: 12px;
    background: var(--bg-elevated); border: 1px solid var(--border);
    color: var(--text-secondary); font-size: 11.5px; cursor: pointer;
    transition: background 0.13s ease, border-color 0.13s ease, color 0.13s ease;
    font-family: var(--font-body);
  }
  .sev-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
  .sev-btn--active { border-color: var(--accent); color: var(--accent); background: var(--accent-dim); }

  /* ── Alertes ── */
  .col-alerts { display: flex; flex-direction: column; }
  .alerts-list { display: flex; flex-direction: column; gap: 8px; }

  .alert-card {
    background: var(--bg-surface); border: 1px solid;
    border-radius: var(--radius); overflow: hidden;
    display: flex;
    transition: transform 0.18s ease, box-shadow 0.18s ease;
    animation: card-in 0.3s ease both;
  }
  .alert-card:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(0,0,0,0.3); }

  .alert-sev {
    writing-mode: vertical-rl; text-orientation: mixed;
    padding: 14px 8px; font-family: var(--font-mono);
    font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase;
    flex-shrink: 0; display: flex; align-items: center; justify-content: center;
    min-width: 28px;
  }
  .alert-body { padding: 14px 16px; flex: 1; min-width: 0; }
  .alert-title { font-size: 14px; color: var(--text-primary); margin-bottom: 5px; font-weight: 500; line-height: 1.4; }
  .alert-summary { font-size: 12.5px; color: var(--text-secondary); line-height: 1.55; margin-bottom: 10px; }
  .alert-meta { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
  .alert-source { font-family: var(--font-mono); font-size: 11px; color: var(--accent); }
  .alert-date { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); }
  .alert-tags { display: flex; flex-wrap: wrap; gap: 4px; }
  .tag {
    font-size: 11px; padding: 2px 7px; border-radius: 10px;
    background: var(--bg-elevated); border: 1px solid var(--border);
    color: var(--text-muted); font-family: var(--font-mono);
  }

  /* ── Colonne droite ── */
  .col-right { display: flex; flex-direction: column; gap: 16px; }
  .panel {
    background: var(--bg-surface); border: 1px solid var(--border);
    border-radius: var(--radius); padding: 16px 18px;
  }

  /* ── Tendances ── */
  .trends-list { display: flex; flex-direction: column; gap: 2px; }
  .trend-row {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 9px 10px; border-radius: var(--radius-sm);
    transition: background 0.15s ease;
    animation: card-in 0.3s ease both;
  }
  .trend-row:hover { background: var(--bg-elevated); }
  .trend-rank {
    font-family: var(--font-mono); font-size: 10px; color: var(--text-muted);
    width: 14px; flex-shrink: 0; padding-top: 2px; text-align: right;
  }
  .trend-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .trend-topic-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .trend-topic { font-size: 13px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .trend-delta { font-family: var(--font-mono); font-size: 10.5px; flex-shrink: 0; }
  .trend-delta--up   { color: #4caf78; }
  .trend-delta--down { color: #e06060; }
  .trend-sources { display: flex; flex-wrap: wrap; gap: 3px; }
  .trend-source-chip {
    font-size: 10px; padding: 1px 5px; border-radius: 4px;
    background: var(--bg-elevated); border: 1px solid var(--border);
    color: var(--text-muted); font-family: var(--font-mono);
  }
  .trend-source-chip--more { color: var(--accent); border-color: rgba(201,168,76,0.3); background: var(--accent-dim); }
  .trend-count {
    font-family: var(--font-mono); font-size: 12px; color: var(--accent);
    background: var(--accent-dim); border: 1px solid rgba(201,168,76,0.25);
    padding: 1px 7px; border-radius: 6px; flex-shrink: 0; margin-top: 1px;
  }

  /* ── Activité sources ── */
  .sources-activity { display: flex; flex-direction: column; gap: 12px; }
  .sa-row {
    display: flex; flex-direction: column; gap: 5px;
    animation: card-in 0.3s ease both;
  }
  .sa-header { display: flex; align-items: center; justify-content: space-between; }
  .sa-name-row { display: flex; align-items: center; gap: 7px; min-width: 0; }
  .sa-type-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .sa-name { font-size: 12.5px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }
  .sa-counts { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .sa-today { font-family: var(--font-mono); font-size: 11px; color: #4caf78; }
  .sa-total { font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); }
  .sa-date { font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); }

  /* ── Barre de progression ── */
  .prog-track {
    height: 3px; background: var(--bg-elevated);
    border-radius: 2px; overflow: hidden;
  }
  .prog-fill { height: 100%; border-radius: 2px; transition: width 0.8s cubic-bezier(0.4,0,0.2,1); }

  /* ── États vides ── */
  .empty-panel {
    display: flex; flex-direction: column; align-items: center;
    gap: 10px; padding: 36px 20px; color: var(--text-secondary); font-size: 13px;
  }
  .empty-panel svg { width: 32px; height: 32px; color: var(--text-muted); }

  /* ── Spinner ── */
  .spinner {
    width: 18px; height: 18px; border: 1.5px solid var(--border-hover);
    border-top-color: var(--accent); border-radius: 50%;
    animation: spin 0.7s linear infinite; display: inline-block;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
`;