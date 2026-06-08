import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { useSources } from "../hooks/useSources";
import { server } from "./mswServer";

afterEach(() => {
  vi.useRealTimers();
});

describe("useSources", () => {

  // ── Chargement initial ─────────────────────────────────────────────────────

  it("charge les sources au montage", async () => {
    const { result } = renderHook(() => useSources());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.sources).toHaveLength(2);
    expect(result.current.sources[0].name).toBe("TechCrunch RSS");
  });

  it("reste silencieux si l'API échoue au chargement (état vide)", async () => {
    server.use(
      http.get("/api/v1/sources/", () => HttpResponse.json({}, { status: 500 }))
    );

    const { result } = renderHook(() => useSources());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.sources).toHaveLength(0);
  });

  // ── addSource ──────────────────────────────────────────────────────────────

  it("addSource ajoute la nouvelle source en tête de liste", async () => {
    const { result } = renderHook(() => useSources());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.addSource({
        name: "Nouvelle source",
        source_type: "rss",
        url: "https://new.com/feed",
      });
    });

    expect(result.current.sources[0].name).toBe("Nouvelle source");
    expect(result.current.sources[0].id).toBe("src-new");
    expect(result.current.sources).toHaveLength(3);
  });

  it("addSource lève une erreur si l'API répond en erreur", async () => {
    server.use(
      http.post("/api/v1/sources/", () => HttpResponse.json({}, { status: 422 }))
    );

    const { result } = renderHook(() => useSources());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let threw = false;
    try {
      await act(async () => {
        await result.current.addSource({
          name: "X",
          source_type: "rss",
          url: "https://x.com",
        });
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  // ── toggleSource ───────────────────────────────────────────────────────────

  it("toggleSource inverse le statut is_active de la source", async () => {
    const { result } = renderHook(() => useSources());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.toggleSource("src-1");
    });

    const toggled = result.current.sources.find((s) => s.id === "src-1");
    expect(toggled).toBeDefined();
    expect(toggled!.is_active).toBe(false);
  });

  // ── deleteSource ───────────────────────────────────────────────────────────

  it("deleteSource retire la source de la liste", async () => {
    const { result } = renderHook(() => useSources());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.deleteSource("src-1");
    });

    expect(result.current.sources.find((s) => s.id === "src-1")).toBeUndefined();
    expect(result.current.sources).toHaveLength(1);
  });

  // ── ingestAll / ingestOne ──────────────────────────────────────────────────

  it("ingestAll crée une tâche PENDING", async () => {
    const { result } = renderHook(() => useSources());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.ingestAll();
    });

    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0].task_id).toBe("task-abc123");
    expect(result.current.tasks[0].status).toBe("PENDING");
  });

  it("ingestOne crée une tâche avec le bon task_id", async () => {
    const { result } = renderHook(() => useSources());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.ingestOne("src-1");
    });

    expect(result.current.tasks[0].task_id).toBe("task-src-1");
  });

  // ── Polling ────────────────────────────────────────────────────────────────

  it("le polling met à jour le statut d'une tâche PENDING vers SUCCESS", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const { result } = renderHook(() => useSources());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.ingestAll();
    });

    expect(result.current.tasks[0].status).toBe("PENDING");

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    await waitFor(() =>
      expect(result.current.tasks[0].status).toBe("SUCCESS")
    );

    expect(result.current.tasks[0].result?.chunks_stored).toBe(42);
  });

  it("le polling s'arrête quand toutes les tâches sont terminées", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { result } = renderHook(() => useSources());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.ingestAll();
    });

    await act(async () => { vi.advanceTimersByTime(1500); });
    await waitFor(() => expect(result.current.tasks[0].status).toBe("SUCCESS"));

    const callsAfterSuccess = fetchSpy.mock.calls.length;

    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(fetchSpy.mock.calls.length).toBe(callsAfterSuccess);

    fetchSpy.mockRestore();
  });

  // ── dismissTask ────────────────────────────────────────────────────────────

  it("dismissTask retire la tâche de la liste", async () => {
    const { result } = renderHook(() => useSources());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.ingestAll();
    });

    expect(result.current.tasks).toHaveLength(1);

    act(() => {
      result.current.dismissTask("task-abc123");
    });

    expect(result.current.tasks).toHaveLength(0);
  });
});