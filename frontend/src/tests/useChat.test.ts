import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { useChat } from "../hooks/useChat";
import { server } from "./mswServer";

describe("useChat", () => {

  // ── État initial ───────────────────────────────────────────────────────────

  it("initialise avec un historique vide et isLoading à false", () => {
    const { result } = renderHook(() => useChat());
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.streamEnabled).toBe(true);
  });

  it("respecte l'option stream:false", () => {
    const { result } = renderHook(() => useChat({ stream: false }));
    expect(result.current.streamEnabled).toBe(false);
  });

  // ── Mode normal (JSON) ─────────────────────────────────────────────────────

  it("envoie un message et reçoit une réponse en mode normal", async () => {
    const { result } = renderHook(() => useChat({ stream: false }));

    await act(async () => {
      await result.current.sendMessage("Bonjour");
    });

    const messages = result.current.messages;
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("Bonjour");
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].content).toBe("Voici ma réponse.");
    expect(messages[1].sources).toHaveLength(1);
    expect(messages[1].sources![0].title).toBe("Source A");
  });

  it("isLoading passe à true pendant l'envoi puis revient à false", async () => {
    server.use(
      http.post("/api/chat", async () => {
        await new Promise((r) => setTimeout(r, 20));
        return HttpResponse.json({ answer: "OK", sources: [] });
      })
    );

    const { result } = renderHook(() => useChat({ stream: false }));

    act(() => {
      result.current.sendMessage("test");
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.messages).toHaveLength(2);
  });

  it("n'envoie pas si le message est vide ou uniquement des espaces", async () => {
    const { result } = renderHook(() => useChat({ stream: false }));

    await act(async () => {
      await result.current.sendMessage("   ");
    });

    expect(result.current.messages).toHaveLength(0);
  });

  it("n'envoie pas si isLoading est déjà true", async () => {
    server.use(
      http.post("/api/chat", async () => {
        await new Promise((r) => setTimeout(r, 50));
        return HttpResponse.json({ answer: "OK", sources: [] });
      })
    );

    const { result } = renderHook(() => useChat({ stream: false }));

    act(() => { result.current.sendMessage("premier"); });
    await act(async () => {
      await result.current.sendMessage("doublon");
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.messages).toHaveLength(2);
  });

  it("affiche un message d'erreur si l'API répond en erreur", async () => {
    server.use(
      http.post("/api/chat", () => HttpResponse.json({}, { status: 500 }))
    );

    const { result } = renderHook(() => useChat({ stream: false }));

    await act(async () => {
      await result.current.sendMessage("test erreur");
    });

    const last = result.current.messages.at(-1)!;
    expect(last.role).toBe("assistant");
    expect(last.content).toMatch(/erreur|serveur/i);
  });

  // ── Mode streaming (SSE) ───────────────────────────────────────────────────

  it("accumule les tokens SSE et marque isStreaming correctement", async () => {
    // MSW Node ne fournit pas de vrai ReadableStream sur res.body.
    // On mocke fetch directement pour retourner un Response avec un
    // ReadableStream contrôlé, comme le ferait un vrai navigateur.
    const lines = [
      `data: ${JSON.stringify({ token: "Bonjour" })}\n`,
      `data: ${JSON.stringify({ token: " monde" })}\n`,
      `data: ${JSON.stringify({ sources: [{ title: "Src", url: "https://x.com", score: 0.9 }] })}\n`,
      "data: [DONE]\n",
    ].join("");

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(lines));
        controller.close();
      },
    });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    );

    const { result } = renderHook(() => useChat({ stream: true }));

    await act(async () => {
      await result.current.sendMessage("test stream");
    });

    const assistant = result.current.messages.find((m) => m.role === "assistant");
    expect(assistant).toBeDefined();
    expect(assistant!.content).toBe("Bonjour monde");
    expect(assistant!.isStreaming).toBe(false);
    expect(assistant!.sources).toHaveLength(1);

    fetchSpy.mockRestore();
  });

  // ── Abort ──────────────────────────────────────────────────────────────────

  it("abort stoppe le chargement et marque le message comme non-streaming", async () => {
    server.use(
      http.post("/api/chat/stream", async ({ request }) => {
        await new Promise<void>((_, reject) => {
          request.signal.addEventListener("abort", () => reject(new DOMException("aborted")));
        });
        return HttpResponse.json({});
      })
    );

    const { result } = renderHook(() => useChat({ stream: true }));

    act(() => { result.current.sendMessage("long query"); });

    await waitFor(() => expect(result.current.messages).toHaveLength(2));

    act(() => { result.current.abort(); });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    const last = result.current.messages.at(-1)!;
    expect(last.isStreaming).toBe(false);
  });

  // ── clearHistory ───────────────────────────────────────────────────────────

  it("clearHistory vide les messages et arrête tout chargement", async () => {
    const { result } = renderHook(() => useChat({ stream: false }));

    await act(async () => {
      await result.current.sendMessage("message");
    });
    expect(result.current.messages).toHaveLength(2);

    act(() => { result.current.clearHistory(); });

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.isLoading).toBe(false);
  });

  // ── setStreamEnabled ───────────────────────────────────────────────────────

  it("setStreamEnabled bascule le mode streaming", () => {
    const { result } = renderHook(() => useChat({ stream: true }));
    expect(result.current.streamEnabled).toBe(true);

    act(() => { result.current.setStreamEnabled(false); });
    expect(result.current.streamEnabled).toBe(false);
  });
});