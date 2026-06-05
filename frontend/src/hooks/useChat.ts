import { useState, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Source {
  title: string;
  url: string;
  score: number;
  published_at?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  timestamp: Date;
  isStreaming?: boolean;
}

export interface UseChatOptions {
  stream?: boolean;
}

export interface UseChatReturn {
  messages: Message[];
  isLoading: boolean;
  streamEnabled: boolean;
  setStreamEnabled: (v: boolean) => void;
  sendMessage: (content: string) => Promise<void>;
  clearHistory: () => void;
  abort: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamEnabled, setStreamEnabled] = useState(options.stream ?? true);
  const abortRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
    // Marquer le dernier message comme non-streaming s'il était en cours
    setMessages((prev) =>
      prev.map((m, i) =>
        i === prev.length - 1 && m.isStreaming ? { ...m, isStreaming: false } : m
      )
    );
  }, []);

  const clearHistory = useCallback(() => {
    abort();
    setMessages([]);
  }, [abort]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: content.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      const assistantId = crypto.randomUUID();

      if (streamEnabled) {
        await sendStreaming(assistantId, content);
      } else {
        await sendNormal(assistantId, content);
      }

      setIsLoading(false);
    },
    [isLoading, streamEnabled] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── Mode streaming (SSE) ───────────────────────────────────────────────────

  async function sendStreaming(assistantId: string, content: string) {
    const placeholder: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true,
    };
    setMessages((prev) => [...prev, placeholder]);

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: content }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Pas de body dans la réponse SSE");

      const decoder = new TextDecoder();
      let accumulated = "";
      let sources: Source[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") continue;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.token) accumulated += parsed.token;
            if (parsed.sources) sources = parsed.sources;
          } catch {
            // Token non-JSON, on l'ajoute brut
            accumulated += raw;
          }
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: accumulated, sources, isStreaming: true }
              : m
          )
        );
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, isStreaming: false, sources } : m
        )
      );
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "Une erreur est survenue lors de la génération.", isStreaming: false }
            : m
        )
      );
    }
  }

  // ── Mode normal (JSON) ─────────────────────────────────────────────────────

  async function sendNormal(assistantId: string, content: string) {
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: content }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const msg: Message = {
        id: assistantId,
        role: "assistant",
        content: data.answer || data.detail || "Pas de réponse.",
        sources: data.sources ?? [],
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, msg]);
    } catch {
      const errMsg: Message = {
        id: assistantId,
        role: "assistant",
        content: "Impossible de contacter le serveur.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
    }
  }

  return { messages, isLoading, streamEnabled, setStreamEnabled, sendMessage, clearHistory, abort };
}