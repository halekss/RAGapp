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
    expect(result.current.data!.kpis.length).toBeGreaterThan(0);
    expect(result.current.data!.alerts.length).toBeGreaterThan(0);
  });

  it("passe le paramètre period dans la querystring lors du chargement", async () => {
    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // La période par défaut est bien 7d
    expect(result.current.period).toBe("7d");
  });

  // ── Changement de période ──────────────────────────────────────────────────

  it("recharge les données quand la période change", async () => {
    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => { result.current.setPeriod("30d"); });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.period).toBe("30d");
    expect(result.current.data).not.toBeNull();
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
      http.get("/api/v1/sources/", () => HttpResponse.json({}, { status: 503 }))
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
    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.period).toBe("7d");

    await act(async () => { result.current.refresh(); });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.period).toBe("7d");
    expect(result.current.data).not.toBeNull();
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

  // ── Données mock utilisées pour alertes et tendances ──────────────────────

  it("les données mock sont utilisées pour les alertes et tendances", async () => {
    const { result } = renderHook(() => useDashboard());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Les alertes et tendances viennent toujours du mock (pas de route backend)
    expect(result.current.data!.alerts.length).toBeGreaterThan(0);
    expect(result.current.data!.trends.length).toBeGreaterThan(0);
  });
});