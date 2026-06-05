import { useState, useCallback, useEffect, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SourceType   = "rss" | "scraper" | "pdf";
export type SourceStatus = "active" | "inactive" | "error";

export interface Source {
  id: string;
  name: string;
  type: SourceType;
  url: string;
  status: SourceStatus;
  last_ingested?: string;
  chunks_count?: number;
  schedule?: string;
}

export type TaskStatus = "PENDING" | "STARTED" | "SUCCESS" | "FAILURE";

export interface IngestionTask {
  task_id: string;
  status: TaskStatus;
  result?: {
    chunks_stored: number;
    skipped_duplicates: number;
    errors: string[];
  };
  error?: string;
}

export interface UseSources {
  // Données
  sources:      Source[];
  tasks:        IngestionTask[];
  isLoading:    boolean;
  // CRUD
  addSource:    (data: Omit<Source, "id" | "status">) => Promise<void>;
  toggleSource: (id: string) => Promise<void>;
  deleteSource: (id: string) => Promise<void>;
  // Ingestion
  ingestSource: (sourceId?: string) => Promise<void>;
  uploadPDFs:   (files: File[], name?: string) => Promise<void>;
  // Tâches
  dismissTask:  (taskId: string) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSources(): UseSources {
  const [sources, setSources]   = useState<Source[]>([]);
  const [tasks, setTasks]       = useState<IngestionTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Polling des tâches actives
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Chargement initial
  useEffect(() => {
    loadSources();
  }, []);

  // Démarre/arrête le polling selon les tâches en cours
  useEffect(() => {
    const hasActive = tasks.some(
      (t) => t.status === "PENDING" || t.status === "STARTED"
    );

    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(pollTasks, 1500);
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
  }, [tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Chargement ─────────────────────────────────────────────────────────────

  async function loadSources() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/sources");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Source[] = await res.json();
      setSources(data);
    } catch {
      // Silencieux : la page affiche l'état vide
    } finally {
      setIsLoading(false);
    }
  }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  const addSource = useCallback(async (data: Omit<Source, "id" | "status">) => {
    const res = await fetch("/api/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const created: Source = await res.json();
    setSources((prev) => [created, ...prev]);
  }, []);

  const toggleSource = useCallback(async (id: string) => {
    const res = await fetch(`/api/sources/${id}/toggle`, { method: "POST" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setSources((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, status: s.status === "active" ? "inactive" : "active" }
          : s
      )
    );
  }, []);

  const deleteSource = useCallback(async (id: string) => {
    const res = await fetch(`/api/sources/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    setSources((prev) => prev.filter((s) => s.id !== id));
  }, []);

  // ── Ingestion ──────────────────────────────────────────────────────────────

  const ingestSource = useCallback(async (sourceId?: string) => {
    const url = sourceId
      ? `/api/ingestion/trigger/${sourceId}`
      : "/api/ingestion/trigger";
    const res = await fetch(url, { method: "POST" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.task_id) {
      setTasks((prev) => [
        { task_id: data.task_id, status: "PENDING" },
        ...prev,
      ]);
    }
  }, []);

  const uploadPDFs = useCallback(async (files: File[], name?: string) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    if (name) form.append("name", name);

    const res = await fetch("/api/sources/upload-pdf", {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.task_id) {
      setTasks((prev) => [
        { task_id: data.task_id, status: "PENDING" },
        ...prev,
      ]);
    }
  }, []);

  // ── Polling tâches ─────────────────────────────────────────────────────────

  async function pollTasks() {
    setTasks((prev) => {
      const active = prev.filter(
        (t) => t.status === "PENDING" || t.status === "STARTED"
      );
      if (!active.length) return prev;

      // Lance les requêtes en parallèle, met à jour l'état une fois toutes reçues
      Promise.all(
        active.map((t) =>
          fetch(`/api/ingestion/status/${t.task_id}`)
            .then((r) => r.json() as Promise<IngestionTask>)
            .catch(() => t) // En cas d'erreur réseau, on conserve l'état actuel
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
  }

  const dismissTask = useCallback((taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.task_id !== taskId));
  }, []);

  return {
    sources,
    tasks,
    isLoading,
    addSource,
    toggleSource,
    deleteSource,
    ingestSource,
    uploadPDFs,
    dismissTask,
  };
}