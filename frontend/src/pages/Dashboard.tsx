import { useDashboard } from "../hooks/useDashboard";
import type { KPI, Alert, Trend, SourceActivity } from "../hooks/useDashboard";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatValue(kpi: KPI): string {
  const v = kpi.value;
  const suffix = kpi.unit ? ` ${kpi.unit}` : "";
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M${suffix}`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k${suffix}`;
  return `${v}${suffix}`;
}

function formatDelta(d: number): string {
  return (d >= 0 ? "+" : "") + d.toFixed(1) + "%";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Sparkline SVG ────────────────────────────────────────────────────────────

function Sparkline({ data }: { data: number[] }) {
  if (!data.length) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 80;
  const h = 28;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="kpi-sparkline">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function Dashboard() {
  const { data, period, setPeriod, isLoading } = useDashboard();

  return (
    <div className="dashboard-page">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="dashboard-header">
        <h1 className="dashboard-header__title">Tableau de bord</h1>
        <div className="dashboard-period-tabs">
          {(["7d", "30d", "90d"] as const).map((p) => (
            <button
              key={p}
              className={`period-tab ${period === p ? "period-tab--active" : ""}`}
              onClick={() => setPeriod(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </header>

      {isLoading || !data ? (
        <div className="dashboard-loading">
          <span className="dashboard-spinner" />
          <p>Chargement des données…</p>
        </div>
      ) : (
        <>
          {/* ── KPIs ──────────────────────────────────────────────────── */}
          <section className="dashboard-kpis">
            {data.kpis.map((kpi: KPI) => (
              <div key={kpi.label} className="kpi-card">
                <span className="kpi-card__label">{kpi.label}</span>
                <span className="kpi-card__value">{formatValue(kpi)}</span>
                {kpi.delta !== undefined && (
                  <span className={`kpi-card__trend ${kpi.delta >= 0 ? "kpi-card__trend--up" : "kpi-card__trend--down"}`}>
                    {kpi.delta >= 0 ? "↑" : "↓"} {Math.abs(kpi.delta).toFixed(1)}%
                  </span>
                )}
                {kpi.sparkline && <Sparkline data={kpi.sparkline} />}
              </div>
            ))}
          </section>

          {/* ── Alertes ───────────────────────────────────────────────── */}
          {data.alerts.length > 0 && (
            <section className="dashboard-section">
              <h2 className="dashboard-section__title">
                Alertes
                <span className="dashboard-badge">{data.alerts.length}</span>
              </h2>
              <div className="alerts-list">
                {data.alerts.map((alert: Alert) => (
                  <div key={alert.id} className={`alert-card alert-card--${alert.severity}`}>
                    <div className="alert-card__header">
                      <span className="alert-card__severity">
                        {alert.severity.toUpperCase()}
                      </span>
                      <span className="alert-card__source">{alert.source}</span>
                      <time className="alert-card__time">
                        {formatDate(alert.published_at)}
                      </time>
                    </div>
                    <p className="alert-card__title">{alert.title}</p>
                    <p className="alert-card__summary">{alert.summary}</p>
                    {alert.tags.length > 0 && (
                      <div className="alert-card__tags">
                        {alert.tags.map((tag) => (
                          <span key={tag} className="tag-chip">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Tendances ─────────────────────────────────────────────── */}
          {data.trends.length > 0 && (
            <section className="dashboard-section">
              <h2 className="dashboard-section__title">Tendances</h2>
              <div className="trends-list">
                {data.trends.map((trend: Trend, i: number) => (
                  <div key={i} className="trend-row">
                    <span className="trend-row__topic">{trend.topic}</span>
                    <div className="trend-row__bar-bg">
                      <div
                        className="trend-row__bar-fill"
                        style={{
                          width: `${Math.min(100, (trend.count / (data.trends[0]?.count || 1)) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="trend-row__count">{trend.count}</span>
                    <span className={`trend-row__delta ${trend.delta >= 0 ? "trend-row__delta--up" : "trend-row__delta--down"}`}>
                      {trend.delta >= 0 ? "↑" : "↓"} {Math.abs(trend.delta)}%
                    </span>
                    {trend.sources.length > 0 && (
                      <span className="trend-row__sources">{trend.sources.slice(0, 2).join(", ")}</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Activité des sources ──────────────────────────────────── */}
          {data.sources_activity.length > 0 && (
            <section className="dashboard-section">
              <h2 className="dashboard-section__title">Activité des sources</h2>
              <div className="sources-activity">
                {data.sources_activity.map((src: SourceActivity, i: number) => (
                  <div key={i} className="source-activity-row">
                    <span className="source-activity-row__type">{src.type.toUpperCase()}</span>
                    <span className="source-activity-row__name">{src.name}</span>
                    <span className="source-activity-row__chunks">
                      +{src.chunks_today} aujourd'hui
                    </span>
                    <span className="source-activity-row__total">
                      {src.chunks_total.toLocaleString("fr-FR")} total
                    </span>
                    <time className="source-activity-row__time">
                      {formatDate(src.last_ingested)}
                    </time>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}