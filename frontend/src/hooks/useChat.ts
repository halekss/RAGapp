/**
 * useChat — hook principal du chat RAG.
 *
 * Routes utilisées :
 *   POST   /api/v1/chat/          → réponse complète (stream: false)
 *   POST   /api/v1/chat/stream    → SSE token par token (stream: true)
 *   GET    /api/v1/chat/history   → historique serveur (pour restauration)
 *   DELETE /api/v1/chat/history   → effacement côté serveur
 */

import { useState, useCallback, useRef } from "react";
import { apiGet, apiPost, apiDelete, apiStream, ApiError, StreamSource } from "../api/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatSource {
  title: string;
  url: string;
  source_type: string;
  collected_at?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[];
  isStreaming?: boolean;
  error?: string;
  created_at?: string;
}

// Payload renvoyé par POST /api/v1/chat/
interface ChatResponse {
  answer: string;
  sources?: ChatSource[];
}

// Payload renvoyé par GET /api/v1/chat/history
interface HistoryEntry {
  id: string;
  question: string;
  answer: string | null;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid(): string {
  return crypto.randomUUID();
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseChatOptions {
  /** Si true (défaut), utilise l'endpoint SSE /stream. */
  stream?: boolean;
}

export interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  streamEnabled: boolean;
  setStreamEnabled: (v: boolean) => void;
  sendMessage: (text: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  loadHistory: () => Promise<void>;
  abort: () => void;
  error: string | null;
}

export function useChat(opts: UseChatOptions = {}): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamEnabled, setStreamEnabled] = useState(opts.stream ?? true);
  const [error, setError] = useState<string | null>(null);

  // Ref pour annuler un stream en cours si l'utilisateur envoie un nouveau message
  const abortRef = useRef<(() => void) | null>(null);

  // ── helpers internes ───────────────────────────────────────────────────────

  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updateLastAssistant = useCallback(
    (updater: (prev: ChatMessage) => ChatMessage) => {
      setMessages((prev) => {
        const idx = [...prev].reverse().findIndex((m) => m.role === "assistant");
        if (idx === -1) return prev;
        const realIdx = prev.length - 1 - idx;
        const updated = [...prev];
        updated[realIdx] = updater(updated[realIdx]);
        return updated;
      });
    },
    []
  );

  // ── sendMessage ───────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isLoading) return;

      // Annuler un éventuel stream précédent
      if (abortRef.current) {
        abortRef.current();
        abortRef.current = null;
      }

      setError(null);
      setIsLoading(true);

      // Message utilisateur
      const userMsg: ChatMessage = { id: uid(), role: "user", content: trimmed };
      appendMessage(userMsg);

      if (streamEnabled) {
        // ── mode SSE ────────────────────────────────────────────────────────

        const assistantId = uid();
        const placeholder: ChatMessage = {
          id: assistantId,
          role: "assistant",
          content: "",
          isStreaming: true,
        };
        appendMessage(placeholder);

        abortRef.current = apiStream(
          "/chat/stream",
          { question: trimmed },
          // onToken
          (token) => {
            updateLastAssistant((prev) => ({
              ...prev,
              content: prev.content + token,
            }));
          },
          // onDone — reçoit les sources structurées depuis l'événement SSE "done"
          (sources: StreamSource[]) => {
            console.log("onDone sources:", sources);
            updateLastAssistant((prev) => ({
              ...prev,
              isStreaming: false,
              sources: sources.map((s) => ({
                title: s.title,
                url: s.url,
                source_type: s.source_type,
              })),
            }));
            setIsLoading(false);
            abortRef.current = null;
          },
          // onError
          (err) => {
            updateLastAssistant((prev) => ({
              ...prev,
              isStreaming: false,
              error: err instanceof ApiError ? err.detail : err.message,
            }));
            setError(err instanceof ApiError ? err.detail : err.message);
            setIsLoading(false);
            abortRef.current = null;
          }
        );
      } else {
        // ── mode réponse complète ────────────────────────────────────────────

        try {
          const data = await apiPost<ChatResponse>("/chat/", {
            question: trimmed,
          });

          const assistantMsg: ChatMessage = {
            id: uid(),
            role: "assistant",
            content: data.answer,
            sources: data.sources ?? [],
          };
          appendMessage(assistantMsg);
        } catch (err) {
          const msg =
            err instanceof ApiError ? err.detail : (err as Error).message;
          const errorMsg: ChatMessage = {
            id: uid(),
            role: "assistant",
            content: "",
            error: msg,
          };
          appendMessage(errorMsg);
          setError(msg);
        } finally {
          setIsLoading(false);
        }
      }
    },
    [isLoading, streamEnabled, appendMessage, updateLastAssistant]
  );

  // ── clearHistory ──────────────────────────────────────────────────────────

  const clearHistory = useCallback(async () => {
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
    }
    setMessages([]);
    setIsLoading(false);
    setError(null);
    try {
      await apiDelete("/chat/history");
    } catch {
      // L'effacement local a déjà eu lieu ; l'erreur réseau n'est pas bloquante.
    }
  }, []);

  // ── loadHistory ───────────────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    try {
      const entries = await apiGet<HistoryEntry[]>("/chat/history");
      const restored: ChatMessage[] = entries.flatMap((e) => {
        const user: ChatMessage = {
          id: `${e.id}-q`,
          role: "user",
          content: e.question,
          created_at: e.created_at,
        };
        if (!e.answer) return [user];
        const assistant: ChatMessage = {
          id: `${e.id}-a`,
          role: "assistant",
          content: e.answer,
          created_at: e.created_at,
        };
        return [user, assistant];
      });
      setMessages(restored);
    } catch {
      // Silencieux : l'UI reste vide si l'historique est inaccessible.
    }
  }, []);

  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
    }
    setIsLoading(false);
  }, []);

  return {
    messages,
    isLoading,
    streamEnabled,
    setStreamEnabled,
    sendMessage,
    clearHistory,
    loadHistory,
    abort,
    error,
  };
}