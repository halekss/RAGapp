import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

export const FIXTURE_SOURCES = [
  {
    id: "src-1",
    name: "TechCrunch RSS",
    source_type: "rss",
    url: "https://techcrunch.com/feed/",
    is_active: true,
    schedule: null,
    client_id: "client-demo",
  },
  {
    id: "src-2",
    name: "Rapports 2024",
    source_type: "pdf",
    url: "https://example.com/report.pdf",
    is_active: false,
    schedule: null,
    client_id: "client-demo",
  },
];

export const FIXTURE_DASHBOARD = {
  period: "7 derniers jours",
  kpis: [
    { label: "Documents ingérés", value: 1284, delta: 12.4, sparkline: [80, 95, 112] },
    { label: "Chunks indexés",    value: 38420, delta: 9.1,  sparkline: [4200, 5100, 7100] },
  ],
  alerts: [
    {
      id: "a1",
      title: "Lancement produit concurrent",
      summary: "Un concurrent a annoncé un nouveau produit.",
      source: "TechCrunch",
      published_at: "2025-06-04T09:14:00Z",
      severity: "high",
      tags: ["lancement", "concurrent"],
    },
  ],
  trends: [
    { topic: "IA générative", count: 142, delta: 34, sources: ["TechCrunch", "Wired"] },
  ],
  sources_activity: [
    {
      name: "TechCrunch RSS",
      type: "rss",
      chunks_today: 48,
      chunks_total: 12400,
      last_ingested: "2025-06-05T06:00:00Z",
    },
  ],
};

export const FIXTURE_CHAT_HISTORY = [
  {
    id: "log-1",
    question: "Quelles sont les dernières actus tech ?",
    answer: "Voici les dernières nouvelles…",
    created_at: "2025-06-05T10:00:00Z",
  },
];

// ─── Handlers par défaut ──────────────────────────────────────────────────────

export const defaultHandlers = [
  // ── Sources CRUD ────────────────────────────────────────────────────────────

  http.get("/api/v1/sources/", () => HttpResponse.json(FIXTURE_SOURCES)),

  http.post("/api/v1/sources/", async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json(
      {
        id: "src-new",
        is_active: true,
        schedule: null,
        client_id: "client-demo",
        ...body,
      },
      { status: 201 }
    );
  }),

  http.patch("/api/v1/sources/:id", async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    const source = FIXTURE_SOURCES.find((s) => s.id === params.id);
    return HttpResponse.json({ ...source, ...body });
  }),

  http.post("/api/v1/sources/:id/toggle", ({ params }) => {
    const source = FIXTURE_SOURCES.find((s) => s.id === params.id);
    return HttpResponse.json({ ...source, is_active: false });
  }),

  http.delete("/api/v1/sources/:id", () => new HttpResponse(null, { status: 204 })),

  // ── Ingestion ───────────────────────────────────────────────────────────────

  http.post("/api/v1/ingestion/trigger", () =>
    HttpResponse.json(
      { task_id: "task-abc123", message: "Ingestion lancée.", client_slug: "demo" },
      { status: 202 }
    )
  ),

  http.post("/api/v1/ingestion/trigger/:sourceId", ({ params }) =>
    HttpResponse.json(
      { task_id: `task-${params.sourceId}`, message: "Ingestion lancée.", source_id: params.sourceId },
      { status: 202 }
    )
  ),

  http.get("/api/v1/ingestion/status/:taskId", ({ params }) =>
    HttpResponse.json({
      task_id: params.taskId,
      status: "SUCCESS",
      result: { chunks_stored: 42, skipped_duplicates: 3, errors: [] },
    })
  ),

  // ── Chat ────────────────────────────────────────────────────────────────────

  http.post("/api/v1/chat/", () =>
    HttpResponse.json({
      answer: "Voici ma réponse.",
      sources: [{ title: "Source A", url: "https://a.com", source_type: "rss", score: 0.92, excerpt: "…" }],
      query_log_id: "log-new",
      processing_time_ms: 1200,
    })
  ),

  http.post("/api/v1/chat/stream", () =>
    new HttpResponse(
      'data: {"type":"token","content":"Voici"}\n\ndata: {"type":"token","content":" ma réponse."}\n\ndata: {"type":"done","query_log_id":"log-new","processing_time_ms":1200,"sources":[]}\n\n',
      {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }
    )
  ),

  http.get("/api/v1/chat/history", () => HttpResponse.json(FIXTURE_CHAT_HISTORY)),

  http.delete("/api/v1/chat/history", () => new HttpResponse(null, { status: 204 })),

  // ── Dashboard (fallback pour les tests) ────────────────────────────────────

  http.get("/api/dashboard", ({ request }) => {
    const url = new URL(request.url);
    const period = url.searchParams.get("period") ?? "7d";
    return HttpResponse.json({ ...FIXTURE_DASHBOARD, period });
  }),

  // ── Clients ─────────────────────────────────────────────────────────────────

  http.get("/api/v1/clients/me", () =>
    HttpResponse.json({
      id: "client-demo",
      slug: "demo",
      name: "Demo",
      role: "admin",
      is_active: true,
      created_at: "2025-01-01T00:00:00Z",
    })
  ),
];

export const server = setupServer(...defaultHandlers);