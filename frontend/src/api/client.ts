/**
 * Client HTTP partagé pour toutes les routes de l'API v1.
 *
 * La clé API est lue depuis la variable d'environnement Vite :
 *   VITE_API_KEY (définie dans frontend/.env ou frontend/.env.local)
 *
 * Toutes les requêtes partent vers /api/v1/…  ; Nginx les proxifie vers FastAPI.
 */

const API_BASE = "/api/v1";
const API_KEY = import.meta.env.VITE_API_KEY as string;

// ─── Types utilitaires ────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

export interface StreamSource {
  title: string;
  url: string;
  source_type: string;
  score: number;
  excerpt: string;
}

type RequestOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildHeaders(extra: Record<string, string> = {}): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-API-Key": API_KEY ?? "",
    ...extra,
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body?.detail ?? JSON.stringify(body) ?? detail;
    } catch {
      // corps non-JSON, on garde le message par défaut
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ─── API publique ─────────────────────────────────────────────────────────────

export async function apiGet<T>(path: string, opts?: RequestOptions): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    ...opts,
    headers: buildHeaders(opts?.headers),
  });
  return handleResponse<T>(res);
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  opts?: RequestOptions
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    ...opts,
    headers: buildHeaders(opts?.headers),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(res);
}

export async function apiPatch<T>(
  path: string,
  body?: unknown,
  opts?: RequestOptions
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    ...opts,
    headers: buildHeaders(opts?.headers),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handleResponse<T>(res);
}

export async function apiDelete<T = void>(
  path: string,
  opts?: RequestOptions
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    ...opts,
    headers: buildHeaders(opts?.headers),
  });
  return handleResponse<T>(res);
}

/**
 * Ouvre une connexion SSE vers path et appelle les callbacks au fil des tokens.
 * Renvoie une fonction d'annulation (abort).
 *
 * Événements SSE attendus du backend :
 *   {"type": "token",  "content": "…"}
 *   {"type": "error",  "message": "…"}
 *   {"type": "done",   "query_log_id": "…", "processing_time_ms": 123, "sources": […]}
 */
export function apiStream(
  path: string,
  body: unknown,
  onToken: (token: string) => void,
  onDone: (sources: StreamSource[]) => void,
  onError: (err: Error) => void
): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY ?? "",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const err = await res.json();
          detail = err?.detail ?? detail;
        } catch {
          // ignore
        }
        throw new ApiError(res.status, detail);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("ReadableStream non disponible");

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        for (const line of chunk.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          let event: {
            type: string;
            content?: string;
            message?: string;
            sources?: StreamSource[];
          };
          try {
            event = JSON.parse(trimmed.slice(6));
          } catch {
            continue;
          }

          if (event.type === "token" && event.content !== undefined) {
            onToken(event.content);
          } else if (event.type === "done") {
            onDone(event.sources ?? []);
          } else if (event.type === "error") {
            throw new Error(event.message ?? "Erreur serveur durant la génération.");
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      onError(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  return () => controller.abort();
}