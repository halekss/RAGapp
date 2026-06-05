import { useState, useRef, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type SourceType = "rss" | "scraper" | "pdf";
type SourceStatus = "active" | "inactive" | "error";

interface Source {
  id: string;
  name: string;
  type: SourceType;
  url: string;
  status: SourceStatus;
  last_ingested?: string;
  chunks_count?: number;
  schedule?: string;
}

interface TaskStatus {
  task_id: string;
  status: "PENDING" | "STARTED" | "SUCCESS" | "FAILURE";
  result?: { chunks_stored: number; skipped_duplicates: number; errors: string[] };
  error?: string;
}

type Section = "sources" | "upload" | "ingestion";

// ─── Utilitaires ─────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<SourceType, string> = { rss: "RSS", scraper: "Scraping", pdf: "PDF" };
const TYPE_COLORS: Record<SourceType, string> = {
  rss: "#c9a84c",
  scraper: "#7eb8a4",
  pdf: "#a47eb8",
};
const STATUS_LABELS: Record<SourceStatus, string> = {
  active: "Actif",
  inactive: "Inactif",
  error: "Erreur",
};

function formatDate(iso?: string) {
  if (!iso) return "Jamais";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Sous-composants ──────────────────────────────────────────────────────────

function SourceRow({
  source,
  onToggle,
  onDelete,
  onIngest,
}: {
  source: Source;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onIngest: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`source-row ${expanded ? "source-row--expanded" : ""}`}>
      <div className="source-row-main" onClick={() => setExpanded((v) => !v)}>
        <div className="source-row-left">
          <span
            className="type-badge"
            style={{ color: TYPE_COLORS[source.type], borderColor: TYPE_COLORS[source.type] + "40", background: TYPE_COLORS[source.type] + "18" }}
          >
            {TYPE_LABELS[source.type]}
          </span>
          <div className="source-info">
            <span className="source-name">{source.name}</span>
            <span className="source-url">{source.url}</span>
          </div>
        </div>
        <div className="source-row-right">
          <span className={`status-dot status-dot--${source.status}`} title={STATUS_LABELS[source.status]} />
          <span className="source-meta">{formatDate(source.last_ingested)}</span>
          {source.chunks_count !== undefined && (
            <span className="chunks-count">{source.chunks_count} chunks</span>
          )}
          <svg className={`chevron ${expanded ? "chevron--open" : ""}`} viewBox="0 0 16 16" fill="none">
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="source-row-detail">
          {source.schedule && (
            <div className="detail-item">
              <span className="detail-label">Schedule</span>
              <code className="detail-value">{source.schedule}</code>
            </div>
          )}
          <div className="detail-actions">
            <button
              className="detail-btn detail-btn--ingest"
              onClick={(e) => { e.stopPropagation(); onIngest(source.id); }}
            >
              <svg viewBox="0 0 16 16" fill="none">
                <path d="M8 2v8M4 7l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 13h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              Ingérer maintenant
            </button>
            <button
              className={`detail-btn detail-btn--toggle ${source.status === "inactive" ? "detail-btn--activate" : ""}`}
              onClick={(e) => { e.stopPropagation(); onToggle(source.id); }}
            >
              {source.status === "active" ? "Désactiver" : "Activer"}
            </button>
            <button
              className="detail-btn detail-btn--delete"
              onClick={(e) => { e.stopPropagation(); onDelete(source.id); }}
            >
              <svg viewBox="0 0 16 16" fill="none">
                <path d="M2 4h12M6 4V2h4v2M5 4l1 10h4l1-10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Supprimer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddSourceModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (data: Partial<Source>) => Promise<void>;
}) {
  const [type, setType] = useState<SourceType>("rss");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [schedule, setSchedule] = useState("0 */6 * * *");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!name.trim() || !url.trim()) { setError("Nom et URL requis."); return; }
    setLoading(true);
    setError("");
    try {
      await onAdd({ type, name, url, schedule: type !== "pdf" ? schedule : undefined });
      onClose();
    } catch {
      setError("Erreur lors de l'ajout de la source.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">Nouvelle source</h3>
          <button className="modal-close" onClick={onClose}>
            <svg viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label className="field-label">Type</label>
            <div className="type-selector">
              {(["rss", "scraper", "pdf"] as SourceType[]).map((t) => (
                <button
                  key={t}
                  className={`type-opt ${type === t ? "type-opt--active" : ""}`}
                  style={type === t ? { borderColor: TYPE_COLORS[t], color: TYPE_COLORS[t], background: TYPE_COLORS[t] + "18" } : {}}
                  onClick={() => setType(t)}
                >
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label className="field-label">Nom de la source</label>
            <input
              className="field-input"
              placeholder="ex. TechCrunch — IA"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="field-label">
              {type === "rss" ? "URL du flux RSS" : type === "scraper" ? "URL de la page" : "URL ou chemin du PDF"}
            </label>
            <input
              className="field-input"
              placeholder={type === "rss" ? "https://example.com/rss.xml" : "https://example.com/newsroom"}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          {type !== "pdf" && (
            <div className="field">
              <label className="field-label">Schedule (cron)</label>
              <input
                className="field-input field-input--mono"
                placeholder="0 */6 * * *"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
              />
              <span className="field-hint">Toutes les 6h par défaut</span>
            </div>
          )}

          {error && <p className="modal-error">{error}</p>}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? "Ajout…" : "Ajouter la source"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TaskMonitor({ taskId, onDone }: { taskId: string; onDone: () => void }) {
  const [status, setStatus] = useState<TaskStatus | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch(`/api/ingestion/status/${taskId}`);
        const data: TaskStatus = await res.json();
        setStatus(data);
        if (data.status === "SUCCESS" || data.status === "FAILURE") {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setTimeout(onDone, 3000);
        }
      } catch {
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }
    poll();
    intervalRef.current = setInterval(poll, 1500);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [taskId, onDone]);

  if (!status) return (
    <div className="task-monitor task-monitor--pending">
      <span className="spinner" />
      <span>Démarrage de la tâche…</span>
    </div>
  );

  const isPending = status.status === "PENDING" || status.status === "STARTED";
  const isSuccess = status.status === "SUCCESS";
  const isFailure = status.status === "FAILURE";

  return (
    <div className={`task-monitor ${isSuccess ? "task-monitor--success" : isFailure ? "task-monitor--failure" : "task-monitor--pending"}`}>
      {isPending && <span className="spinner" />}
      {isSuccess && (
        <svg viewBox="0 0 16 16" fill="none">
          <path d="M3 8l4 4 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      {isFailure && (
        <svg viewBox="0 0 16 16" fill="none">
          <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}
      <div className="task-info">
        {isPending && <span>Ingestion en cours…</span>}
        {isSuccess && status.result && (
          <span>
            {status.result.chunks_stored} chunks stockés
            {status.result.skipped_duplicates > 0 && ` · ${status.result.skipped_duplicates} doublons ignorés`}
          </span>
        )}
        {isFailure && <span>{status.error || "Échec de l'ingestion."}</span>}
      </div>
    </div>
  );
}

function UploadZone({ onUploadDone }: { onUploadDone: (taskId: string) => void }) {
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files).filter((f) => f.type === "application/pdf");
    setFiles((prev) => [...prev, ...dropped]);
  }, []);

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleUpload() {
    if (!files.length) return;
    setUploading(true);
    try {
      const form = new FormData();
      files.forEach((f) => form.append("files", f));
      if (sourceName) form.append("name", sourceName);
      const res = await fetch("/api/sources/upload-pdf", { method: "POST", body: form });
      const data = await res.json();
      onUploadDone(data.task_id);
      setFiles([]);
      setSourceName("");
    } catch {
      // Erreur silencieuse pour l'instant
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="upload-section">
      <div
        className={`drop-zone ${dragging ? "drop-zone--active" : ""} ${files.length ? "drop-zone--has-files" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !files.length && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            const selected = Array.from(e.target.files || []);
            setFiles((prev) => [...prev, ...selected]);
          }}
        />
        {files.length === 0 ? (
          <div className="drop-zone-empty">
            <svg viewBox="0 0 40 40" fill="none">
              <rect x="8" y="4" width="24" height="32" rx="3" stroke="currentColor" strokeWidth="1.5" />
              <path d="M14 14h12M14 20h12M14 26h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M26 4v8h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="drop-zone-label">Glissez vos PDFs ici</p>
            <p className="drop-zone-hint">ou cliquez pour parcourir</p>
          </div>
        ) : (
          <div className="file-list" onClick={(e) => e.stopPropagation()}>
            {files.map((f, i) => (
              <div key={i} className="file-item">
                <svg viewBox="0 0 16 16" fill="none">
                  <rect x="3" y="1" width="10" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M6 6h4M6 9h4M6 12h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                <span className="file-name">{f.name}</span>
                <span className="file-size">{(f.size / 1024).toFixed(0)} Ko</span>
                <button className="file-remove" onClick={() => removeFile(i)}>
                  <svg viewBox="0 0 12 12" fill="none">
                    <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            ))}
            <button className="add-more-btn" onClick={() => inputRef.current?.click()}>
              + Ajouter d'autres PDFs
            </button>
          </div>
        )}
      </div>

      {files.length > 0 && (
        <div className="upload-meta">
          <div className="field">
            <label className="field-label">Nom de la source (optionnel)</label>
            <input
              className="field-input"
              placeholder="ex. Rapports annuels 2024"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
            />
          </div>
          <button
            className="btn-primary btn-primary--full"
            onClick={handleUpload}
            disabled={uploading}
          >
            {uploading ? (
              <><span className="spinner spinner--sm" /> Envoi en cours…</>
            ) : (
              <>
                <svg viewBox="0 0 16 16" fill="none">
                  <path d="M8 10V2M4 6l4-4 4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M2 13h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
                Lancer l'ingestion ({files.length} fichier{files.length > 1 ? "s" : ""})
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function Admin() {
  const [section, setSection] = useState<Section>("sources");
  const [sources, setSources] = useState<Source[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeTasks, setActiveTasks] = useState<string[]>([]);
  const [filter, setFilter] = useState<SourceType | "all">("all");

  // Chargement des sources
  useEffect(() => {
    async function loadSources() {
      setLoadingSources(true);
      try {
        const res = await fetch("/api/sources");
        const data = await res.json();
        setSources(data);
      } catch {
        // Fallback silencieux
      } finally {
        setLoadingSources(false);
      }
    }
    loadSources();
  }, []);

  async function handleAddSource(data: Partial<Source>) {
    const res = await fetch("/api/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const created: Source = await res.json();
    setSources((prev) => [created, ...prev]);
  }

  async function handleToggle(id: string) {
    await fetch(`/api/sources/${id}/toggle`, { method: "POST" });
    setSources((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, status: s.status === "active" ? "inactive" : "active" }
          : s
      )
    );
  }

  async function handleDelete(id: string) {
    await fetch(`/api/sources/${id}`, { method: "DELETE" });
    setSources((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleIngest(sourceId?: string) {
    const url = sourceId ? `/api/ingestion/trigger/${sourceId}` : "/api/ingestion/trigger";
    const res = await fetch(url, { method: "POST" });
    const data = await res.json();
    if (data.task_id) {
      setActiveTasks((prev) => [...prev, data.task_id]);
      setSection("ingestion");
    }
  }

  const filteredSources = filter === "all" ? sources : sources.filter((s) => s.type === filter);
  const sourceCounts = {
    all: sources.length,
    rss: sources.filter((s) => s.type === "rss").length,
    scraper: sources.filter((s) => s.type === "scraper").length,
    pdf: sources.filter((s) => s.type === "pdf").length,
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="admin-root">
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
            <a href="/dashboard" className="nav-item">
              <svg viewBox="0 0 20 20" fill="none">
                <rect x="2" y="10" width="4" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="8" y="6" width="4" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="14" y="2" width="4" height="16" rx="1" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <span>Dashboard</span>
            </a>
            <a href="/admin" className="nav-item nav-item--active">
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

        {/* Zone principale */}
        <main className="admin-main">
          <header className="admin-header">
            <div>
              <h1 className="admin-title">Administration</h1>
              <span className="admin-subtitle">Gestion des sources · Ingestion des données</span>
            </div>
          </header>

          {/* Onglets */}
          <div className="tabs">
            <button
              className={`tab ${section === "sources" ? "tab--active" : ""}`}
              onClick={() => setSection("sources")}
            >
              <svg viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" />
                <path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              Sources
              <span className="tab-count">{sourceCounts.all}</span>
            </button>
            <button
              className={`tab ${section === "upload" ? "tab--active" : ""}`}
              onClick={() => setSection("upload")}
            >
              <svg viewBox="0 0 16 16" fill="none">
                <rect x="3" y="1" width="10" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M6 7l2-2 2 2M8 5v6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Upload PDF
            </button>
            <button
              className={`tab ${section === "ingestion" ? "tab--active" : ""}`}
              onClick={() => setSection("ingestion")}
            >
              <svg viewBox="0 0 16 16" fill="none">
                <path d="M8 2v8M4 7l4 4 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 13h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              Ingestion
              {activeTasks.length > 0 && (
                <span className="tab-count tab-count--active">{activeTasks.length}</span>
              )}
            </button>
          </div>

          {/* Contenu */}
          <div className="admin-content">

            {/* ── Sources ── */}
            {section === "sources" && (
              <div className="section-sources">
                <div className="section-toolbar">
                  <div className="filter-tabs">
                    {(["all", "rss", "scraper", "pdf"] as const).map((f) => (
                      <button
                        key={f}
                        className={`filter-tab ${filter === f ? "filter-tab--active" : ""}`}
                        style={filter === f && f !== "all" ? {
                          color: TYPE_COLORS[f as SourceType],
                          borderColor: TYPE_COLORS[f as SourceType],
                          background: TYPE_COLORS[f as SourceType] + "18",
                        } : {}}
                        onClick={() => setFilter(f)}
                      >
                        {f === "all" ? "Toutes" : TYPE_LABELS[f as SourceType]}
                        <span className="filter-count">
                          {f === "all" ? sourceCounts.all : sourceCounts[f as SourceType]}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="toolbar-actions">
                    <button
                      className="btn-outline"
                      onClick={() => handleIngest()}
                      title="Ingérer toutes les sources actives"
                    >
                      <svg viewBox="0 0 16 16" fill="none">
                        <path d="M8 2v8M4 7l4 4 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M2 13h12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                      </svg>
                      Tout ingérer
                    </button>
                    <button className="btn-primary" onClick={() => setShowAddModal(true)}>
                      <svg viewBox="0 0 16 16" fill="none">
                        <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                      Ajouter une source
                    </button>
                  </div>
                </div>

                {loadingSources ? (
                  <div className="loading-state">
                    <span className="spinner" />
                    <span>Chargement des sources…</span>
                  </div>
                ) : filteredSources.length === 0 ? (
                  <div className="empty-sources">
                    <svg viewBox="0 0 48 48" fill="none">
                      <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M24 14v10M24 30v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <p>Aucune source configurée</p>
                    <button className="btn-primary" onClick={() => setShowAddModal(true)}>
                      Ajouter la première source
                    </button>
                  </div>
                ) : (
                  <div className="sources-list">
                    {filteredSources.map((s) => (
                      <SourceRow
                        key={s.id}
                        source={s}
                        onToggle={handleToggle}
                        onDelete={handleDelete}
                        onIngest={handleIngest}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Upload PDF ── */}
            {section === "upload" && (
              <div className="section-upload">
                <div className="section-intro">
                  <h2 className="section-heading">Import de documents PDF</h2>
                  <p className="section-desc">
                    Les fichiers uploadés sont découpés en chunks, vectorisés et indexés dans Qdrant
                    sous le namespace du client actif. Ils seront immédiatement disponibles pour le Chat.
                  </p>
                </div>
                <UploadZone onUploadDone={(taskId) => {
                  setActiveTasks((prev) => [...prev, taskId]);
                  setSection("ingestion");
                }} />
              </div>
            )}

            {/* ── Ingestion ── */}
            {section === "ingestion" && (
              <div className="section-ingestion">
                <div className="section-intro">
                  <h2 className="section-heading">Suivi des tâches d'ingestion</h2>
                  <p className="section-desc">
                    Chaque ingestion est une tâche Celery asynchrone. Le statut se met à jour en
                    temps réel jusqu'à complétion.
                  </p>
                </div>

                {activeTasks.length === 0 ? (
                  <div className="empty-sources">
                    <svg viewBox="0 0 48 48" fill="none">
                      <path d="M24 8v16M16 17l8 8 8-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M8 38h32" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    <p>Aucune tâche en cours</p>
                    <button className="btn-outline" onClick={() => setSection("sources")}>
                      Aller aux sources
                    </button>
                  </div>
                ) : (
                  <div className="tasks-list">
                    {activeTasks.map((taskId) => (
                      <div key={taskId} className="task-item">
                        <code className="task-id">{taskId.slice(0, 16)}…</code>
                        <TaskMonitor
                          taskId={taskId}
                          onDone={() => setActiveTasks((prev) => prev.filter((t) => t !== taskId))}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="ingestion-info">
                  <h3 className="info-heading">Pipeline d'ingestion</h3>
                  <div className="pipeline-steps">
                    {[
                      { label: "Collecte", desc: "Lecture du fichier ou scraping de l'URL" },
                      { label: "Chunking", desc: "Découpage en segments de ~512 tokens avec overlap" },
                      { label: "Embedding", desc: "Vectorisation via le modèle d'embedding configuré" },
                      { label: "Indexation", desc: "Stockage dans Qdrant sous le namespace client" },
                    ].map((step, i) => (
                      <div key={i} className="pipeline-step">
                        <span className="step-num">{i + 1}</span>
                        <div>
                          <p className="step-label">{step.label}</p>
                          <p className="step-desc">{step.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {showAddModal && (
        <AddSourceModal onClose={() => setShowAddModal(false)} onAdd={handleAddSource} />
      )}
    </>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');

  :root {
    --bg-base: #0e0e0f;
    --bg-surface: #141415;
    --bg-elevated: #1a1a1c;
    --bg-hover: #202023;
    --border: rgba(255,255,255,0.07);
    --border-hover: rgba(255,255,255,0.14);
    --text-primary: #e8e6e0;
    --text-secondary: #8a8780;
    --text-muted: #4a4845;
    --accent: #c9a84c;
    --accent-dim: rgba(201,168,76,0.15);
    --accent-hover: #d4b565;
    --radius: 12px;
    --radius-sm: 8px;
    --sidebar-w: 220px;
    --font-serif: 'DM Serif Display', Georgia, serif;
    --font-body: 'DM Sans', sans-serif;
    --font-mono: 'DM Mono', monospace;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  .admin-root {
    display: flex;
    height: 100vh;
    background: var(--bg-base);
    color: var(--text-primary);
    font-family: var(--font-body);
    font-size: 14px;
    line-height: 1.6;
    overflow: hidden;
  }

  /* ── Sidebar (identique Chat) ─── */
  .sidebar {
    width: var(--sidebar-w);
    min-width: var(--sidebar-w);
    background: var(--bg-surface);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    padding: 24px 16px;
    gap: 8px;
  }
  .sidebar-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 4px 20px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 8px;
  }
  .brand-mark { width: 32px; height: 32px; color: var(--accent); flex-shrink: 0; }
  .brand-mark svg { width: 100%; height: 100%; }
  .brand-name { font-family: var(--font-serif); font-size: 18px; color: var(--text-primary); letter-spacing: 0.02em; }
  .sidebar-nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
  .nav-item {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 12px; border-radius: var(--radius-sm);
    color: var(--text-secondary); text-decoration: none;
    font-size: 13.5px; font-weight: 400;
    transition: background 0.18s ease, color 0.18s ease;
    position: relative;
  }
  .nav-item svg { width: 16px; height: 16px; flex-shrink: 0; }
  .nav-item:hover { background: var(--bg-hover); color: var(--text-primary); }
  .nav-item--active { background: var(--accent-dim); color: var(--accent); }
  .nav-item--active:hover { background: var(--accent-dim); color: var(--accent-hover); }
  .nav-item--active::before {
    content: ''; position: absolute; left: 0; top: 6px; bottom: 6px;
    width: 2px; background: var(--accent); border-radius: 2px;
  }
  .sidebar-footer { border-top: 1px solid var(--border); padding-top: 16px; }
  .client-badge { display: flex; align-items: center; gap: 7px; padding: 0 4px; }
  .client-dot { width: 6px; height: 6px; border-radius: 50%; background: #4caf78; box-shadow: 0 0 6px rgba(76,175,120,0.5); flex-shrink: 0; }
  .client-name { font-size: 12px; color: var(--text-secondary); font-family: var(--font-mono); }

  /* ── Main ─── */
  .admin-main {
    flex: 1; display: flex; flex-direction: column;
    min-width: 0; overflow: hidden;
  }
  .admin-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 20px 28px 18px; border-bottom: 1px solid var(--border);
    background: var(--bg-base); flex-shrink: 0;
  }
  .admin-title { font-family: var(--font-serif); font-size: 20px; font-weight: 400; color: var(--text-primary); letter-spacing: 0.01em; }
  .admin-subtitle { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); letter-spacing: 0.04em; }

  /* ── Onglets ─── */
  .tabs {
    display: flex; gap: 2px; padding: 12px 28px 0;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .tab {
    display: flex; align-items: center; gap: 7px;
    padding: 8px 14px 10px; border-radius: var(--radius-sm) var(--radius-sm) 0 0;
    background: transparent; border: none; color: var(--text-secondary);
    font-size: 13.5px; cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
    font-family: var(--font-body); position: relative; bottom: -1px;
    border-bottom: 2px solid transparent;
  }
  .tab svg { width: 14px; height: 14px; }
  .tab:hover { color: var(--text-primary); background: var(--bg-elevated); }
  .tab--active { color: var(--accent); border-bottom-color: var(--accent); }
  .tab-count {
    font-family: var(--font-mono); font-size: 10px;
    background: var(--bg-elevated); border: 1px solid var(--border);
    padding: 1px 5px; border-radius: 10px; color: var(--text-secondary);
  }
  .tab-count--active { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }

  /* ── Contenu ─── */
  .admin-content { flex: 1; overflow-y: auto; padding: 24px 28px; scrollbar-width: thin; scrollbar-color: var(--bg-elevated) transparent; }
  .admin-content::-webkit-scrollbar { width: 5px; }
  .admin-content::-webkit-scrollbar-thumb { background: var(--bg-elevated); border-radius: 3px; }

  /* ── Toolbar sources ─── */
  .section-toolbar {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 16px; flex-wrap: wrap; gap: 10px;
  }
  .filter-tabs { display: flex; gap: 4px; }
  .filter-tab {
    padding: 5px 11px; border-radius: 20px;
    background: var(--bg-elevated); border: 1px solid var(--border);
    color: var(--text-secondary); font-size: 12.5px; cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    font-family: var(--font-body); display: flex; align-items: center; gap: 5px;
  }
  .filter-tab:hover { background: var(--bg-hover); color: var(--text-primary); }
  .filter-tab--active { border-color: var(--accent); color: var(--accent); background: var(--accent-dim); }
  .filter-count { font-family: var(--font-mono); font-size: 10px; color: inherit; opacity: 0.7; }
  .toolbar-actions { display: flex; gap: 8px; }

  /* ── Boutons ─── */
  .btn-primary {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 14px; border-radius: var(--radius-sm);
    background: var(--accent-dim); border: 1px solid var(--accent);
    color: var(--accent); font-size: 13px; cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
    font-family: var(--font-body);
  }
  .btn-primary svg { width: 13px; height: 13px; }
  .btn-primary:hover { background: var(--accent); color: var(--bg-base); }
  .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-primary--full { width: 100%; justify-content: center; padding: 11px; font-size: 14px; }

  .btn-outline {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 14px; border-radius: var(--radius-sm);
    background: transparent; border: 1px solid var(--border);
    color: var(--text-secondary); font-size: 13px; cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    font-family: var(--font-body);
  }
  .btn-outline svg { width: 13px; height: 13px; }
  .btn-outline:hover { background: var(--bg-hover); border-color: var(--border-hover); color: var(--text-primary); }

  .btn-secondary {
    padding: 8px 14px; border-radius: var(--radius-sm);
    background: transparent; border: 1px solid var(--border);
    color: var(--text-secondary); font-size: 13px; cursor: pointer;
    transition: background 0.15s ease; font-family: var(--font-body);
  }
  .btn-secondary:hover { background: var(--bg-hover); }

  /* ── Lignes de source ─── */
  .sources-list { display: flex; flex-direction: column; gap: 4px; }

  .source-row {
    background: var(--bg-surface); border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
    transition: border-color 0.15s ease;
    animation: row-in 0.2s ease both;
  }
  @keyframes row-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  .source-row:hover { border-color: var(--border-hover); }
  .source-row--expanded { border-color: var(--border-hover); }

  .source-row-main {
    display: flex; align-items: center; justify-content: space-between;
    padding: 11px 14px; cursor: pointer; gap: 12px;
  }
  .source-row-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .source-row-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }

  .type-badge {
    font-family: var(--font-mono); font-size: 10px; font-weight: 500;
    padding: 2px 7px; border-radius: 4px; border: 1px solid;
    letter-spacing: 0.05em; flex-shrink: 0;
  }
  .source-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .source-name { font-size: 13.5px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .source-url { font-family: var(--font-mono); font-size: 10.5px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 300px; }

  .status-dot {
    width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
  }
  .status-dot--active { background: #4caf78; box-shadow: 0 0 5px rgba(76,175,120,0.5); }
  .status-dot--inactive { background: var(--text-muted); }
  .status-dot--error { background: #e06060; box-shadow: 0 0 5px rgba(224,96,96,0.5); }

  .source-meta { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); }
  .chunks-count { font-family: var(--font-mono); font-size: 11px; color: var(--accent); background: var(--accent-dim); padding: 1px 6px; border-radius: 4px; }

  .chevron { width: 14px; height: 14px; color: var(--text-muted); transition: transform 0.2s ease; }
  .chevron--open { transform: rotate(180deg); }

  .source-row-detail {
    padding: 10px 14px 14px;
    border-top: 1px solid var(--border);
    background: var(--bg-elevated);
    animation: detail-in 0.15s ease;
  }
  @keyframes detail-in { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }

  .detail-item { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .detail-label { font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; width: 60px; flex-shrink: 0; }
  .detail-value { font-family: var(--font-mono); font-size: 11.5px; color: var(--text-secondary); }

  .detail-actions { display: flex; gap: 6px; flex-wrap: wrap; }

  .detail-btn {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 10px; border-radius: 6px; font-size: 12px;
    cursor: pointer; transition: background 0.13s ease, color 0.13s ease;
    font-family: var(--font-body); border: 1px solid var(--border);
    background: transparent; color: var(--text-secondary);
  }
  .detail-btn svg { width: 12px; height: 12px; }
  .detail-btn:hover { background: var(--bg-hover); color: var(--text-primary); border-color: var(--border-hover); }

  .detail-btn--ingest { color: var(--accent); border-color: rgba(201,168,76,0.3); background: var(--accent-dim); }
  .detail-btn--ingest:hover { background: var(--accent); color: var(--bg-base); }

  .detail-btn--activate { color: #4caf78; border-color: rgba(76,175,120,0.3); background: rgba(76,175,120,0.1); }
  .detail-btn--activate:hover { background: rgba(76,175,120,0.2); }

  .detail-btn--delete:hover { color: #e06060; border-color: rgba(224,96,96,0.3); background: rgba(224,96,96,0.1); }

  /* ── Upload ─── */
  .section-upload { max-width: 580px; }
  .section-intro { margin-bottom: 20px; }
  .section-heading { font-family: var(--font-serif); font-size: 18px; font-weight: 400; color: var(--text-primary); margin-bottom: 6px; }
  .section-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.6; }

  .drop-zone {
    border: 1.5px dashed var(--border-hover); border-radius: var(--radius);
    background: var(--bg-surface);
    transition: border-color 0.2s ease, background 0.2s ease;
    min-height: 160px; display: flex; align-items: center; justify-content: center;
    cursor: pointer;
  }
  .drop-zone--active { border-color: var(--accent); background: var(--accent-dim); }
  .drop-zone--has-files { cursor: default; padding: 16px; align-items: flex-start; }

  .drop-zone-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 32px; }
  .drop-zone-empty svg { width: 40px; height: 40px; color: var(--text-muted); }
  .drop-zone-label { font-size: 14px; color: var(--text-secondary); }
  .drop-zone-hint { font-size: 12px; color: var(--text-muted); }

  .file-list { display: flex; flex-direction: column; gap: 6px; width: 100%; }
  .file-item {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 10px; border-radius: var(--radius-sm);
    background: var(--bg-elevated); border: 1px solid var(--border);
  }
  .file-item svg { width: 14px; height: 14px; color: #a47eb8; flex-shrink: 0; }
  .file-name { flex: 1; font-size: 12.5px; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .file-size { font-family: var(--font-mono); font-size: 10.5px; color: var(--text-muted); flex-shrink: 0; }
  .file-remove {
    width: 20px; height: 20px; border-radius: 4px; background: transparent;
    border: none; color: var(--text-muted); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.13s ease, color 0.13s ease;
  }
  .file-remove svg { width: 10px; height: 10px; }
  .file-remove:hover { background: rgba(224,96,96,0.15); color: #e06060; }

  .add-more-btn {
    padding: 7px 12px; border-radius: var(--radius-sm);
    background: transparent; border: 1px dashed var(--border-hover);
    color: var(--text-muted); font-size: 12px; cursor: pointer;
    transition: border-color 0.15s ease, color 0.15s ease;
    font-family: var(--font-body); text-align: center;
  }
  .add-more-btn:hover { border-color: var(--accent); color: var(--accent); }

  .upload-meta { margin-top: 16px; display: flex; flex-direction: column; gap: 12px; }

  /* ── Champs formulaire ─── */
  .field { display: flex; flex-direction: column; gap: 5px; }
  .field-label { font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--text-muted); }
  .field-input {
    background: var(--bg-elevated); border: 1px solid var(--border);
    border-radius: var(--radius-sm); padding: 8px 10px;
    color: var(--text-primary); font-size: 13.5px; font-family: var(--font-body);
    outline: none; transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .field-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
  .field-input::placeholder { color: var(--text-muted); }
  .field-input--mono { font-family: var(--font-mono); font-size: 12.5px; }
  .field-hint { font-size: 11px; color: var(--text-muted); }

  /* ── Ingestion / tâches ─── */
  .section-ingestion { max-width: 620px; }

  .tasks-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 28px; }
  .task-item {
    background: var(--bg-surface); border: 1px solid var(--border);
    border-radius: var(--radius-sm); padding: 12px 14px;
    display: flex; flex-direction: column; gap: 8px;
  }
  .task-id { font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); }

  .task-monitor {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 12px; border-radius: var(--radius-sm);
    font-size: 13px;
  }
  .task-monitor svg { width: 16px; height: 16px; flex-shrink: 0; }
  .task-monitor--pending { background: var(--bg-elevated); color: var(--text-secondary); }
  .task-monitor--success { background: rgba(76,175,120,0.1); border: 1px solid rgba(76,175,120,0.25); color: #4caf78; }
  .task-monitor--failure { background: rgba(224,96,96,0.1); border: 1px solid rgba(224,96,96,0.25); color: #e06060; }
  .task-info { display: flex; flex-direction: column; }

  .ingestion-info { margin-top: 28px; }
  .info-heading { font-family: var(--font-serif); font-size: 16px; font-weight: 400; color: var(--text-primary); margin-bottom: 14px; }
  .pipeline-steps { display: flex; flex-direction: column; gap: 2px; }
  .pipeline-step {
    display: flex; align-items: flex-start; gap: 12px;
    padding: 10px 14px; border-radius: var(--radius-sm);
    background: var(--bg-surface); border: 1px solid var(--border);
    transition: border-color 0.15s ease;
  }
  .pipeline-step:hover { border-color: var(--border-hover); }
  .step-num {
    width: 22px; height: 22px; border-radius: 50%;
    background: var(--accent-dim); border: 1px solid rgba(201,168,76,0.3);
    color: var(--accent); font-family: var(--font-mono); font-size: 11px;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px;
  }
  .step-label { font-size: 13.5px; color: var(--text-primary); margin-bottom: 2px; }
  .step-desc { font-size: 12px; color: var(--text-secondary); }

  /* ── États vides / loading ─── */
  .empty-sources {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 14px; padding: 60px 20px; text-align: center;
  }
  .empty-sources svg { width: 48px; height: 48px; color: var(--text-muted); }
  .empty-sources p { font-size: 14px; color: var(--text-secondary); }

  .loading-state {
    display: flex; align-items: center; gap: 10px;
    padding: 24px; color: var(--text-secondary); font-size: 13px;
  }

  /* ── Spinner ─── */
  .spinner {
    width: 16px; height: 16px; border: 1.5px solid var(--border-hover);
    border-top-color: var(--accent); border-radius: 50%;
    animation: spin 0.7s linear infinite; flex-shrink: 0; display: inline-block;
  }
  .spinner--sm { width: 13px; height: 13px; border-width: 1.5px; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Modal ─── */
  .modal-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.65);
    display: flex; align-items: center; justify-content: center;
    z-index: 100; backdrop-filter: blur(3px);
    animation: overlay-in 0.15s ease;
  }
  @keyframes overlay-in { from { opacity: 0; } to { opacity: 1; } }

  .modal {
    background: var(--bg-surface); border: 1px solid var(--border-hover);
    border-radius: var(--radius); width: 100%; max-width: 460px;
    margin: 16px; animation: modal-in 0.2s ease;
    box-shadow: 0 24px 64px rgba(0,0,0,0.6);
  }
  @keyframes modal-in { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: none; } }

  .modal-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 20px 16px; border-bottom: 1px solid var(--border);
  }
  .modal-title { font-family: var(--font-serif); font-size: 17px; font-weight: 400; color: var(--text-primary); }
  .modal-close {
    width: 28px; height: 28px; border-radius: 6px; background: transparent;
    border: none; color: var(--text-muted); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.13s ease, color 0.13s ease;
  }
  .modal-close svg { width: 12px; height: 12px; }
  .modal-close:hover { background: var(--bg-hover); color: var(--text-primary); }

  .modal-body { padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }

  .type-selector { display: flex; gap: 6px; }
  .type-opt {
    flex: 1; padding: 7px; border-radius: var(--radius-sm);
    background: var(--bg-elevated); border: 1px solid var(--border);
    color: var(--text-secondary); font-size: 12.5px; cursor: pointer;
    transition: background 0.13s ease, border-color 0.13s ease, color 0.13s ease;
    font-family: var(--font-mono); text-align: center;
  }
  .type-opt:hover { border-color: var(--border-hover); color: var(--text-primary); }

  .modal-error { font-size: 12px; color: #e06060; background: rgba(224,96,96,0.1); padding: 8px 10px; border-radius: var(--radius-sm); border: 1px solid rgba(224,96,96,0.2); }

  .modal-footer {
    display: flex; justify-content: flex-end; gap: 8px;
    padding: 14px 20px 18px; border-top: 1px solid var(--border);
  }
`;