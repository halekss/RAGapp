/**
 * Admin.tsx — gestion des sources de veille.
 *
 * Classes CSS : BEM custom depuis global.css (admin-*)
 * Pas de classes Tailwind utilitaires.
 */

import { useState } from "react";
import { useSources } from "../hooks/useSources";
import type { Source, SourceType } from "../hooks/useSources";

// ─── Constantes ───────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: "",
  source_type: "rss" as SourceType,
  url: "",
  schedule: "",
};

// ─── Composant ────────────────────────────────────────────────────────────────

export default function Admin() {
  const {
    sources,
    tasks,
    isLoading,
    error,
    addSource,
    toggleSource,
    deleteSource,
    ingestAll,
    ingestOne,
    dismissTask,
    reload,
  } = useSources();

  const [form, setForm]           = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        source_type: form.source_type,
        url: form.url.trim(),
        schedule: form.schedule.trim() || undefined,
        is_active: true,
      });
      setForm(EMPTY_FORM);
    } catch (err) {
      setFormError((err as Error).message ?? "Erreur lors de l'ajout.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const [taskError, setTaskError] = useState<string | null>(null);

  const handleIngestOne = async (id: string) => {
    setTaskError(null);
    try {
      await ingestOne(id);
    } catch (err) {
      setTaskError((err as Error).message ?? "Erreur lors du déclenchement.");
    }
  };

  const handleIngestAll = async () => {
    setTaskError(null);
    try {
      await ingestAll();
    } catch (err) {
      setTaskError((err as Error).message ?? "Erreur lors du déclenchement.");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAddSource();
  };

  return (
    <div className="admin-page">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="admin-header">
        <h1 className="admin-header__title">Administration des sources</h1>
        <div className="admin-header__actions">
          <button
            className="admin-btn admin-btn--secondary"
            onClick={reload}
            title="Rafraîchir"
          >
            ↺ Rafraîchir
          </button>
          <button
            className="admin-btn admin-btn--primary"
            onClick={handleIngestAll}
            disabled={sources.filter((s) => s.is_active).length === 0}
            title="Lancer l'ingestion de toutes les sources actives"
          >
            ▷ Ingérer tout
          </button>
        </div>
      </header>

      {/* ── Erreur globale ───────────────────────────────────────────────── */}
      {(error || taskError) && (
        <p className="admin-error">{error ?? taskError}</p>
      )}

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
                  <span className="admin-task__id">
                    Tâche {task.task_id.slice(0, 8)}
                  </span>
                  <span className="admin-task__status">{task.status}</span>
                </div>

                {(task.status === "PENDING" || task.status === "STARTED") && (
                  <div className="admin-task__bar">
                    <div className="admin-task__bar-fill admin-task__bar-fill--indeterminate" />
                  </div>
                )}

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
                    aria-label="Fermer"
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
              onKeyDown={handleKeyDown}
            />
            <select
              className="admin-select"
              value={form.source_type}
              onChange={(e) =>
                setForm((f) => ({ ...f, source_type: e.target.value as SourceType }))
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
              onKeyDown={handleKeyDown}
            />
            <input
              className="admin-input admin-input--schedule"
              placeholder="Cron (ex : 0 */6 * * *)"
              value={form.schedule}
              onChange={(e) =>
                setForm((f) => ({ ...f, schedule: e.target.value }))
              }
            />
          </div>
          <div className="admin-form__row admin-form__row--actions">
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
        <div className="admin-sources-list">
            {sources.map((src: Source) => (
              <div
                key={src.id}
                className="admin-source-row"
              >
                <span className="admin-source-row__type">
                  {src.source_type}
                </span>
                <span className="admin-source-row__name">{src.name}</span>
                {src.url && (
                  <span className="admin-source-row__url">{src.url}</span>
                )}
                <div className="admin-source-row__actions">
                  <button
                    className="admin-btn admin-btn--ghost"
                    onClick={() => handleIngestOne(src.id)}
                    title="Lancer l'ingestion"
                    disabled={!src.is_active}
                  >
                    ▷
                  </button>
                  <button
                    className={`admin-btn admin-btn--ghost${!src.is_active ? " admin-btn--muted" : ""}`}
                    onClick={() => toggleSource(src.id)}
                    title={src.is_active ? "Désactiver" : "Activer"}
                  >
                    {src.is_active ? "● Actif" : "○ Inactif"}
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