import { useState, useRef } from "react";
import { useSources } from "../hooks/useSources";
import type { Source, SourceType } from "../hooks/useSources";

// ─── Formulaire d'ajout ───────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: "",
  type: "rss" as SourceType,
  url: "",
  schedule: "",
};

// ─── Composant ────────────────────────────────────────────────────────────────

export default function Admin() {
  const {
    sources,
    tasks,
    isLoading,
    addSource,
    toggleSource,
    deleteSource,
    ingestSource,
    uploadPDFs,
    dismissTask,
  } = useSources();

  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Ajout d'une source ───────────────────────────────────────────────────

  const handleAddSource = async () => {
    if (!form.name.trim() || !form.url.trim()) {
      setFormError("Le nom et l'URL sont requis.");
      return;
    }
    setFormError(null);
    setIsSubmitting(true);
    try {
      await addSource({
        name: form.name.trim(),
        type: form.type,
        url: form.url.trim(),
        ...(form.schedule ? { schedule: form.schedule } : {}),
      });
      setForm(EMPTY_FORM);
    } catch (err) {
      setFormError((err as Error).message ?? "Erreur lors de l'ajout.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Upload PDF ───────────────────────────────────────────────────────────

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    await uploadPDFs(files);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Ingestion manuelle ───────────────────────────────────────────────────

  const handleIngestAll = () => ingestSource();

  // ────────────────────────────────────────────────────────────────────────

  return (
    <div className="admin-page">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="admin-header">
        <h1 className="admin-header__title">Administration des sources</h1>
        <div className="admin-header__actions">
          <button
            className="admin-btn admin-btn--secondary"
            onClick={() => fileInputRef.current?.click()}
          >
            ↑ Importer PDF
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            multiple
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <button
            className="admin-btn admin-btn--primary"
            onClick={handleIngestAll}
            disabled={sources.length === 0}
          >
            ▷ Ingérer tout
          </button>
        </div>
      </header>

      {/* ── Tâches en cours ─────────────────────────────────────────────── */}
      {tasks.length > 0 && (
        <section className="admin-tasks">
          <h2 className="admin-tasks__title">Tâches en cours</h2>
          <div className="admin-tasks__list">
            {tasks.map((task) => (
              <div
                key={task.task_id}
                className={`admin-task admin-task--${task.status.toLowerCase()}`}
              >
                <div className="admin-task__meta">
                  <span className="admin-task__id">Tâche {task.task_id.slice(0, 8)}</span>
                  <span className="admin-task__status">{task.status}</span>
                </div>

                {/* Barre de progression indéterminée */}
                {(task.status === "PENDING" || task.status === "STARTED") && (
                  <div className="admin-task__bar">
                    <div className="admin-task__bar-fill admin-task__bar-fill--indeterminate" />
                  </div>
                )}

                {/* Résultats */}
                {task.status === "SUCCESS" && task.result && (
                  <p className="admin-task__result">
                    {task.result.chunks_stored} chunks stockés
                    {task.result.skipped_duplicates > 0 &&
                      ` · ${task.result.skipped_duplicates} doublons ignorés`}
                  </p>
                )}

                {task.status === "FAILURE" && task.error && (
                  <p className="admin-task__error">{task.error}</p>
                )}

                {(task.status === "SUCCESS" || task.status === "FAILURE") && (
                  <button
                    className="admin-task__dismiss"
                    onClick={() => dismissTask(task.task_id)}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Formulaire d'ajout ──────────────────────────────────────────── */}
      <section className="admin-form-section">
        <h2 className="admin-section-title">Ajouter une source</h2>
        <div className="admin-form">
          <div className="admin-form__row">
            <input
              className="admin-input"
              placeholder="Nom de la source"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <select
              className="admin-select"
              value={form.type}
              onChange={(e) =>
                setForm((f) => ({ ...f, type: e.target.value as SourceType }))
              }
            >
              <option value="rss">RSS</option>
              <option value="scraper">Scraping</option>
              <option value="pdf">PDF</option>
            </select>
          </div>
          <div className="admin-form__row">
            <input
              className="admin-input admin-input--url"
              placeholder="URL"
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            />
            <button
              className="admin-btn admin-btn--primary"
              onClick={handleAddSource}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Ajout…" : "+ Ajouter"}
            </button>
          </div>
          {formError && <p className="admin-form__error">{formError}</p>}
        </div>
      </section>

      {/* ── Liste des sources ────────────────────────────────────────────── */}
      <section className="admin-sources-section">
        <h2 className="admin-section-title">
          Sources
          <span className="admin-count">{sources.length}</span>
        </h2>

        {isLoading ? (
          <p className="admin-loading">Chargement…</p>
        ) : sources.length === 0 ? (
          <p className="admin-empty">Aucune source configurée.</p>
        ) : (
          <div className="admin-sources">
            {sources.map((src: Source) => (
              <div
                key={src.id}
                className={`admin-source admin-source--${src.status}`}
              >
                <div className="admin-source__info">
                  <span className={`admin-source__type admin-source__type--${src.type}`}>
                    {src.type.toUpperCase()}
                  </span>
                  <span className="admin-source__name">{src.name}</span>
                  <span className="admin-source__url">{src.url}</span>
                  {src.chunks_count !== undefined && (
                    <span className="admin-source__chunks">{src.chunks_count} chunks</span>
                  )}
                </div>
                <div className="admin-source__actions">
                  <button
                    className="admin-btn admin-btn--ghost"
                    onClick={() => ingestSource(src.id)}
                    title="Lancer l'ingestion"
                  >
                    ▷
                  </button>
                  <button
                    className={`admin-btn admin-btn--ghost${src.status !== "active" ? " admin-btn--muted" : ""}`}
                    onClick={() => toggleSource(src.id)}
                    title={src.status === "active" ? "Désactiver" : "Activer"}
                  >
                    {src.status === "active" ? "● Actif" : "○ Inactif"}
                  </button>
                  <button
                    className="admin-btn admin-btn--danger"
                    onClick={() => deleteSource(src.id)}
                    title="Supprimer"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}