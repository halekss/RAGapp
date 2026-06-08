import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { http, HttpResponse } from "msw";
import { useDashboard } from "../hooks/useDashboard";
import { server, FIXTURE_DASHBOARD } from "./mswServer";

describe("useDashboard", () => {

  // ── Chargement initial ─────────────────────────────────────────────────────

  it("charge les données au montage avec la période par défaut (7d)", async () => {
    const { result } = renderHook(() => useDashboard());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeNull();
    expect(result.current.period).toBe("7d");

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).not.toBeNull();
    expect(result.current.data!.kpis).toHaveLength(2);
    expect(result.current.data!.alerts).toHaveLength(1);
  });

  it("passe le paramètre period dans la querystring", async () => {
    let capturedUrl = "";

    server.use(
      http.get("/api/dashboard", ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json(FIXTURE_DASHBOARD);
      })
    );

    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(capturedUrl).toContain("period=7d");
  });

  // ── Changement de période ──────────────────────────────────────────────────

  it("recharge les données quand la période change", async () => {
    let callCount = 0;

    server.use(
      http.get("/api/dashboard", () => {
        callCount++;
        return HttpResponse.json(FIXTURE_DASHBOARD);
      })
    );

    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(callCount).toBe(1);

    act(() => { result.current.setPeriod("30d"); });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(callCount).toBe(2);
    expect(result.current.period).toBe("30d");
  });

  it("le nouveau chargement remet isLoading à true pendant la transition", async () => {
    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => { result.current.setPeriod("90d"); });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  // ── Fallback mock ──────────────────────────────────────────────────────────

  it("utilise les données mock si l'API est indisponible", async () => {
    server.use(
      http.get("/api/dashboard", () => HttpResponse.json({}, { status: 503 }))
    );

    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).not.toBeNull();
    expect(result.current.data!.kpis.length).toBeGreaterThan(0);
    // Le fallback est silencieux : error reste null
    expect(result.current.error).toBeNull();
  });

  // ── refresh ────────────────────────────────────────────────────────────────

  it("refresh recharge les données sans changer la période", async () => {
    let callCount = 0;

    server.use(
      http.get("/api/dashboard", () => {
        callCount++;
        return HttpResponse.json(FIXTURE_DASHBOARD);
      })
    );

    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(callCount).toBe(1);
    expect(result.current.period).toBe("7d");

    await act(async () => { result.current.refresh(); });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(callCount).toBe(2);
    expect(result.current.period).toBe("7d");
  });

  // ── Structure des données ──────────────────────────────────────────────────

  it("les KPIs ont les champs obligatoires label et value", async () => {
    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    for (const kpi of result.current.data!.kpis) {
      expect(kpi).toHaveProperty("label");
      expect(kpi).toHaveProperty("value");
      expect(typeof kpi.value).toBe("number");
    }
  });

  it("les alertes ont les champs id, severity, title, source", async () => {
    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    for (const alert of result.current.data!.alerts) {
      expect(alert).toHaveProperty("id");
      expect(["high", "medium", "low"]).toContain(alert.severity);
      expect(alert).toHaveProperty("title");
      expect(alert).toHaveProperty("source");
    }
  });
});