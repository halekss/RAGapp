/**
 * useSources — hook de gestion des sources.
 *
 * Routes utilisées :
 *   GET    /api/v1/sources/              → lister
 *   POST   /api/v1/sources/              → créer
 *   PATCH  /api/v1/sources/{id}          → modifier
 *   DELETE /api/v1/sources/{id}          → supprimer
 *   POST   /api/v1/sources/{id}/toggle   → activer/désactiver
 *   POST   /api/v1/ingestion/trigger     → ingestion complète
 *   POST   /api/v1/ingestion/trigger/{id}→ ingestion d'une source
 *   GET    /api/v1/ingestion/status/{id} → statut tâche Celery
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SourceType = "rss" | "scraper" | "pdf";

// Correspond exactement au SourceOut du backend
export interface Source {
  id: string;
  name: string;
  source_type: SourceType;
  url: string | null;
  schedule: string | null;
  is_active: boolean;
  client_id: string;
}

export interface SourceCreatePayload {
  name: string;
  source_type: SourceType;
  url?: string;
  schedule?: string;
  is_active?: boolean;
}

export interface SourceUpdatePayload {
  name?: string;
  url?: string;
  schedule?: string;
  is_active?: boolean;
}

export type TaskStatus = "PENDING" | "STARTED" | "SUCCESS" | "FAILURE";

export interface IngestionTask {
  task_id: string;
  status: TaskStatus;
  source_id?: string;     // présent si ingestion d'une seule source
  result?: {
    chunks_stored: number;
    skipped_duplicates: number;
    errors: string[];
  };
  error?: string;
}

export interface UseSources {
  sources:      Source[];
  tasks:        IngestionTask[];
  isLoading:    boolean;
  error:        string | null;
  addSource:    (data: SourceCreatePayload) => Promise<void>;
  updateSource: (id: string, data: SourceUpdatePayload) => Promise<void>;
  toggleSource: (id: string) => Promise<void>;
  deleteSource: (id: string) => Promise<void>;
  ingestAll:    () => Promise<void>;
  ingestOne:    (sourceId: string) => Promise<void>;
  dismissTask:  (taskId: string) => void;
  reload:       () => Promise<void>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSources(): UseSources {
  const [sources, setSources]     = useState<Source[]>([]);
  const [tasks, setTasks]         = useState<IngestionTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Chargement ─────────────────────────────────────────────────────────────

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiGet<Source[]>("/sources/");
      setSources(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : (err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // ── Polling tâches actives ─────────────────────────────────────────────────

  useEffect(() => {
    const hasActive = tasks.some(
      (t) => t.status === "PENDING" || t.status === "STARTED"
    );

    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(async () => {
        setTasks((prev) => {
          const active = prev.filter(
            (t) => t.status === "PENDING" || t.status === "STARTED"
          );
          if (!active.length) return prev;

          Promise.all(
            active.map((t) =>
              apiGet<IngestionTask>(`/ingestion/status/${t.task_id}`).catch(
                () => t
              )
            )
          ).then((updated) => {
            setTasks((current) =>
              current.map((t) => {
                const fresh = updated.find((u) => u.task_id === t.task_id);
                return fresh ?? t;
              })
            );
          });

          return prev;
        });
      }, 1500);
    } else if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [tasks]);

  // ── CRUD ───────────────────────────────────────────────────────────────────

  const addSource = useCallback(async (data: SourceCreatePayload) => {
    const created = await apiPost<Source>("/sources/", data);
    setSources((prev) => [created, ...prev]);
  }, []);

  const updateSource = useCallback(
    async (id: string, data: SourceUpdatePayload) => {
      const updated = await apiPatch<Source>(`/sources/${id}`, data);
      setSources((prev) => prev.map((s) => (s.id === id ? updated : s)));
    },
    []
  );

  const toggleSource = useCallback(async (id: string) => {
    const updated = await apiPost<Source>(`/sources/${id}/toggle`);
    setSources((prev) => prev.map((s) => (s.id === id ? updated : s)));
  }, []);

  const deleteSource = useCallback(async (id: string) => {
    await apiDelete(`/sources/${id}`);
    setSources((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // ── Ingestion ──────────────────────────────────────────────────────────────

  const ingestAll = useCallback(async () => {
    const data = await apiPost<{ task_id: string; message: string }>(
      "/ingestion/trigger"
    );
    setTasks((prev) => [{ task_id: data.task_id, status: "PENDING" }, ...prev]);
  }, []);

  const ingestOne = useCallback(async (sourceId: string) => {
    const data = await apiPost<{ task_id: string; message: string }>(
      `/ingestion/trigger/${sourceId}`
    );
    setTasks((prev) => [
      { task_id: data.task_id, status: "PENDING", source_id: sourceId },
      ...prev,
    ]);
  }, []);

  const dismissTask = useCallback((taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.task_id !== taskId));
  }, []);

  return {
    sources,
    tasks,
    isLoading,
    error,
    addSource,
    updateSource,
    toggleSource,
    deleteSource,
    ingestAll,
    ingestOne,
    dismissTask,
    reload,
  };
}