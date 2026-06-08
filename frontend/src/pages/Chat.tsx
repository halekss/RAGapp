/**
 * Chat.tsx — page principale du chat RAG.
 *
 * Classes CSS : BEM custom depuis global.css (chat-*)
 * Pas de classes Tailwind utilitaires.
 */

import { useEffect, useRef } from "react";
import { useChat, ChatMessage } from "../hooks/useChat";

// ─── Sous-composants ──────────────────────────────────────────────────────────

function SourceBadge({ url, title }: { url: string; title: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="chat-source-badge"
      title={url}
    >
      {title || url}
    </a>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";

  return (
    <div className={`chat-message chat-message--${isUser ? "user" : "assistant"}`}>
      <div className="chat-message__bubble">
        {msg.error ? (
          <span className="chat-message__error">{msg.error}</span>
        ) : (
          <>
            <span className="chat-message__content">
              {msg.content}
              {msg.isStreaming && <span className="chat-message__cursor" aria-hidden />}
            </span>
            {msg.sources && msg.sources.length > 0 && (
              <div className="chat-message__sources">
                <span className="chat-message__sources-label">Sources :</span>
                {msg.sources.map((s, i) => (
                  <SourceBadge key={i} url={s.url} title={s.title} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="chat-empty">
      <p className="chat-empty__title">Posez votre première question</p>
      <p className="chat-empty__subtitle">
        Les réponses sont générées à partir des sources ingérées.
      </p>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function Chat() {
  const {
    messages,
    isLoading,
    streamEnabled,
    setStreamEnabled,
    sendMessage,
    clearHistory,
    loadHistory,
    error,
  } = useChat({ stream: true });

  // Restaurer l'historique serveur au montage
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Scroll automatique vers le bas à chaque nouveau message
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Gestion du formulaire ──────────────────────────────────────────────────

  const inputRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const val = inputRef.current?.value ?? "";
    if (!val.trim() || isLoading) return;
    sendMessage(val);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Entrée seule = envoi ; Shift+Entrée = saut de ligne
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  }

  return (
    <div className="chat">
      {/* ── Barre d'outils ──────────────────────────────────────────────── */}
      <div className="chat-toolbar">
        <span className="chat-toolbar__title">Chat</span>

        <label className="chat-toolbar__toggle">
          <input
            type="checkbox"
            checked={streamEnabled}
            onChange={(e) => setStreamEnabled(e.target.checked)}
          />
          <span>Streaming</span>
        </label>

        <button
          className="chat-toolbar__clear"
          onClick={clearHistory}
          disabled={messages.length === 0}
          title="Effacer l'historique"
        >
          Effacer
        </button>
      </div>

      {/* ── Zone de messages ────────────────────────────────────────────── */}
      <div className="chat-messages" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Erreur globale (non attachée à un message) ───────────────────── */}
      {error && <p className="chat-error">{error}</p>}

      {/* ── Formulaire d'envoi ───────────────────────────────────────────── */}
      <form className="chat-form" onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          className="chat-form__input"
          placeholder="Posez votre question… (Entrée pour envoyer)"
          rows={2}
          disabled={isLoading}
          onKeyDown={handleKeyDown}
          aria-label="Question"
        />
        <button
          type="submit"
          className="chat-form__submit"
          disabled={isLoading}
          aria-label="Envoyer"
        >
          {isLoading ? (
            <span className="chat-form__spinner" aria-hidden />
          ) : (
            "Envoyer"
          )}
        </button>
      </form>
    </div>
  );
}