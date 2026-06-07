import { useRef, useEffect, useState, KeyboardEvent } from "react";
import { useChat } from "../hooks/useChat";

// ─── Suggestions par défaut ──────────────────────────────────────────────────

const DEFAULT_SUGGESTIONS = [
  "Quelles sont les dernières actualités concurrentielles ?",
  "Résume les tendances du marché cette semaine",
  "Quels sont les mouvements récents de nos concurrents ?",
  "Analyse les signaux faibles du secteur",
];

// ─── Composant ────────────────────────────────────────────────────────────────

export default function Chat() {
  const { messages, isLoading, streamEnabled, setStreamEnabled, sendMessage, abort } =
    useChat({ stream: true });

  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll au dernier message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize du textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 180)}px`;
  }, [input]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    await sendMessage(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestion = (text: string) => {
    setInput(text);
    textareaRef.current?.focus();
  };

  return (
    <div className="chat-page">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className="chat-header">
        <div className="chat-header__brand">
          <span className="chat-header__logo">◈</span>
          <span className="chat-header__title">Veille RAG</span>
        </div>
        <label className="stream-toggle" title="Activer/désactiver le streaming">
          <input
            type="checkbox"
            checked={streamEnabled}
            onChange={(e) => setStreamEnabled(e.target.checked)}
          />
          <span className="stream-toggle__label">Streaming</span>
        </label>
      </header>

      {/* ── Zone de messages ──────────────────────────────────────────── */}
      <main className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">
            <p className="chat-empty__title">Que souhaitez-vous analyser ?</p>
            <div className="chat-suggestions">
              {DEFAULT_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="chat-suggestion"
                  onClick={() => handleSuggestion(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`chat-bubble chat-bubble--${msg.role}`}
            >
              <div className="chat-bubble__content">
                {msg.content}
                {msg.isStreaming && <span className="chat-cursor" />}
              </div>

              {/* Sources citées */}
              {msg.sources && msg.sources.length > 0 && !msg.isStreaming && (
                <div className="chat-sources">
                  <p className="chat-sources__label">Sources</p>
                  <div className="chat-sources__list">
                    {msg.sources.map((src, i) => (
                      <a
                        key={i}
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="chat-source-chip"
                      >
                        <span className="chat-source-chip__score">
                          {Math.round(src.score * 100)}%
                        </span>
                        <span className="chat-source-chip__title">{src.title}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <time className="chat-bubble__time">
                {new Date(msg.timestamp).toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </main>

      {/* ── Barre de saisie ────────────────────────────────────────────── */}
      <footer className="chat-footer">
        <div className="chat-input-row">
          <textarea
            ref={textareaRef}
            className="chat-input"
            placeholder="Posez votre question…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={1}
          />

          {isLoading ? (
            <button className="chat-btn chat-btn--abort" onClick={abort}>
              ■ Stop
            </button>
          ) : (
            <button
              className="chat-btn chat-btn--send"
              onClick={handleSend}
              disabled={!input.trim()}
            >
              ↑ Envoyer
            </button>
          )}
        </div>
        <p className="chat-footer__hint">Entrée pour envoyer · Shift+Entrée pour sauter une ligne</p>
      </footer>
    </div>
  );
}