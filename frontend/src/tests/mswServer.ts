import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

export const FIXTURE_SOURCES = [
  {
    id: "src-1",
    name: "TechCrunch RSS",
    type: "rss",
    url: "https://techcrunch.com/feed/",
    status: "active",
    chunks_count: 1240,
    last_ingested: "2025-06-05T06:00:00Z",
  },
  {
    id: "src-2",
    name: "Rapports 2024",
    type: "pdf",
    url: "https://example.com/report.pdf",
    status: "inactive",
    chunks_count: 320,
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

// ─── Handlers par défaut ──────────────────────────────────────────────────────

export const defaultHandlers = [
  // Sources CRUD
  http.get("/api/sources", () => HttpResponse.json(FIXTURE_SOURCES)),

  http.post("/api/sources", async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({ id: "src-new", status: "active", ...body }, { status: 201 });
  }),

  http.post("/api/sources/:id/toggle", ({ params }) =>
    HttpResponse.json({ id: params.id, status: "inactive" })
  ),

  http.delete("/api/sources/:id", () => new HttpResponse(null, { status: 204 })),

  // Ingestion
  http.post("/api/ingestion/trigger", () =>
    HttpResponse.json({ task_id: "task-abc123" }, { status: 202 })
  ),

  http.post("/api/ingestion/trigger/:sourceId", ({ params }) =>
    HttpResponse.json({ task_id: `task-${params.sourceId}` }, { status: 202 })
  ),

  http.get("/api/ingestion/status/:taskId", ({ params }) =>
    HttpResponse.json({
      task_id: params.taskId,
      status: "SUCCESS",
      result: { chunks_stored: 42, skipped_duplicates: 3, errors: [] },
    })
  ),

  // Upload PDF
  http.post("/api/sources/upload-pdf", () =>
    HttpResponse.json({ task_id: "task-pdf-upload" }, { status: 202 })
  ),

  // Chat
  http.post("/api/chat", () =>
    HttpResponse.json({
      answer: "Voici ma réponse.",
      sources: [{ title: "Source A", url: "https://a.com", score: 0.92 }],
    })
  ),

  // Dashboard
  http.get("/api/dashboard", () => HttpResponse.json(FIXTURE_DASHBOARD)),
];

export const server = setupServer(...defaultHandlers);