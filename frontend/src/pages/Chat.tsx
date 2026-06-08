import { useState, useRef, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Source {
  title: string;
  url: string;
  score: number;
  published_at?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  timestamp: Date;
  isStreaming?: boolean;
}

// ─── Composants utilitaires ───────────────────────────────────────────────────

function SourceCard({ source }: { source: Source }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="source-card"
    >
      <span className="source-score">{Math.round(source.score * 100)}%</span>
      <span className="source-title">{source.title}</span>
      {source.published_at && (
        <span className="source-date">
          {new Date(source.published_at).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
      )}
    </a>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  return (
    <div className={`message-row ${isUser ? "message-row--user" : "message-row--assistant"}`}>
      {!isUser && (
        <div className="avatar">
          <span>V</span>
        </div>
      )}
      <div className={`bubble ${isUser ? "bubble--user" : "bubble--assistant"}`}>
        <p className="bubble-content">
          {message.content}
          {message.isStreaming && <span className="cursor-blink">▋</span>}
        </p>
        {message.sources && message.sources.length > 0 && (
          <div className="sources-section">
            <p className="sources-label">Sources</p>
            <div className="sources-list">
              {message.sources.map((src, i) => (
                <SourceCard key={i} source={src} />
              ))}
            </div>
          </div>
        )}
        <span className="bubble-time">
          {message.timestamp.toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
      {isUser && <div className="avatar avatar--user"><span>A</span></div>}
    </div>
  );
}

function EmptyState() {
  const suggestions = [
    "Qu'est-ce que nos concurrents ont annoncé ce trimestre ?",
    "Quelles sont les dernières évolutions tarifaires observées ?",
    "Y a-t-il eu des recrutements stratégiques récents ?",
    "Résume les publications de la semaine sur notre secteur.",
  ];

  return (
    <div className="empty-state">
      <div className="empty-logo">
        <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 20 L28 20 M20 12 L20 28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="20" cy="20" r="4" fill="currentColor" opacity="0.4" />
        </svg>
      </div>
      <h2 className="empty-title">Veille Concurrentielle</h2>
      <p className="empty-subtitle">Posez une question sur vos données ingérées</p>
      <div className="suggestions">
        {suggestions.map((s, i) => (
          <button key={i} className="suggestion-pill" onClick={() => {
            const input = document.getElementById("chat-input") as HTMLTextAreaElement;
            if (input) {
              input.value = s;
              input.focus();
              input.dispatchEvent(new Event("input", { bubbles: true }));
            }
          }}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [useStream, setUseStream] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  async function sendMessage() {
    const content = input.trim();
    if (!content || isLoading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setIsLoading(true);

    const assistantId = crypto.randomUUID();

    if (useStream) {
      // Mode streaming
      const streamingMsg: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        isStreaming: true,
      };
      setMessages((prev) => [...prev, streamingMsg]);

      abortRef.current = new AbortController();

      try {
        const res = await fetch("/api/chat/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: content }),
          signal: abortRef.current.signal,
        });

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";
        let sources: Source[] = [];

        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });

          // Parse SSE lines
          for (const line of chunk.split("\n")) {
            if (line.startsWith("data: ")) {
              const raw = line.slice(6).trim();
              if (raw === "[DONE]") continue;
              try {
                const parsed = JSON.parse(raw);
                if (parsed.token) accumulated += parsed.token;
                if (parsed.sources) sources = parsed.sources;
              } catch {
                accumulated += raw;
              }
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
        if ((err as Error).name !== "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: "Une erreur est survenue lors de la génération.",
                    isStreaming: false,
                  }
                : m
            )
          );
        }
      }
    } else {
      // Mode normal
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: content }),
        });
        const data = await res.json();
        const assistantMsg: Message = {
          id: assistantId,
          role: "assistant",
          content: data.answer || data.detail || "Pas de réponse.",
          sources: data.sources || [],
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
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

    setIsLoading(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function clearHistory() {
    setMessages([]);
    if (abortRef.current) abortRef.current.abort();
    setIsLoading(false);
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="chat-root">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="brand-mark">
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <span className="brand-name">Veille</span>
          </div>

          <nav className="sidebar-nav">
            <a href="/chat" className="nav-item nav-item--active">
              <svg viewBox="0 0 20 20" fill="none">
                <path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H6l-4 3V5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
              <span>Chat</span>
            </a>
            <a href="/dashboard" className="nav-item">
              <svg viewBox="0 0 20 20" fill="none">
                <rect x="2" y="10" width="4" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="8" y="6" width="4" height="12" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="14" y="2" width="4" height="16" rx="1" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <span>Dashboard</span>
            </a>
            <a href="/admin" className="nav-item">
              <svg viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" />
                <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.22 4.22l1.42 1.42M14.36 14.36l1.42 1.42M4.22 15.78l1.42-1.42M14.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              <span>Admin</span>
            </a>
          </nav>

          <div className="sidebar-footer">
            <div className="client-badge">
              <span className="client-dot" />
              <span className="client-name">Client actif</span>
            </div>
            <div className="stream-toggle">
              <span>Streaming</span>
              <button
                className={`toggle ${useStream ? "toggle--on" : ""}`}
                onClick={() => setUseStream((v) => !v)}
                aria-label="Activer le streaming"
              >
                <span className="toggle-thumb" />
              </button>
            </div>
          </div>
        </aside>

        {/* Zone principale */}
        <main className="chat-main">
          <header className="chat-header">
            <div className="chat-header-left">
              <h1 className="chat-title">Analyse concurrentielle</h1>
              <span className="chat-subtitle">Données ingérées · LLaMA 3.1</span>
            </div>
            {messages.length > 0 && (
              <button className="btn-clear" onClick={clearHistory}>
                <svg viewBox="0 0 16 16" fill="none">
                  <path d="M2 4h12M6 4V2h4v2M5 4l1 10h4l1-10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Effacer
              </button>
            )}
          </header>

          <div className="messages-area">
            {messages.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="messages-list">
                {messages.map((m) => (
                  <MessageBubble key={m.id} message={m} />
                ))}
                {isLoading && messages[messages.length - 1]?.role === "user" && (
                  <div className="message-row message-row--assistant">
                    <div className="avatar"><span>V</span></div>
                    <div className="bubble bubble--assistant bubble--thinking">
                      <span className="dot-pulse" />
                      <span className="dot-pulse" />
                      <span className="dot-pulse" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          <div className="input-area">
            <div className="input-wrapper">
              <textarea
                id="chat-input"
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  autoResize();
                }}
                onKeyDown={handleKeyDown}
                placeholder="Posez votre question… (Shift+Entrée pour sauter une ligne)"
                className="chat-textarea"
                rows={1}
                disabled={isLoading}
              />
              <div className="input-actions">
                {isLoading ? (
                  <button
                    className="btn-stop"
                    onClick={() => abortRef.current?.abort()}
                    title="Arrêter"
                  >
                    <svg viewBox="0 0 16 16" fill="currentColor">
                      <rect x="3" y="3" width="10" height="10" rx="1.5" />
                    </svg>
                  </button>
                ) : (
                  <button
                    className={`btn-send ${input.trim() ? "btn-send--active" : ""}`}
                    onClick={sendMessage}
                    disabled={!input.trim()}
                    title="Envoyer"
                  >
                    <svg viewBox="0 0 16 16" fill="none">
                      <path d="M13.5 8L2 2.5l2.5 5.5-2.5 5.5L13.5 8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <p className="input-hint">
              Les réponses sont générées à partir des documents ingérés.
              <span className="input-hint-accent"> Aucune donnée externe.</span>
            </p>
          </div>
        </main>
      </div>
    </>
  );
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500&display=swap');

  :root {
    --bg-base: #0e0e0f;
    --bg-surface: #141415;
    --bg-elevated: #1a1a1c;
    --bg-hover: #202023;
    --border: rgba(255,255,255,0.07);
    --border-hover: rgba(255,255,255,0.14);
    --text-primary: #e8e6e0;
    --text-secondary: #8a8780;
    --text-muted: #4a4845;
    --accent: #c9a84c;
    --accent-dim: rgba(201,168,76,0.15);
    --accent-hover: #d4b565;
    --user-bg: #1e1c18;
    --user-border: rgba(201,168,76,0.2);
    --radius: 12px;
    --radius-sm: 8px;
    --sidebar-w: 220px;
    --font-serif: 'DM Serif Display', Georgia, serif;
    --font-body: 'DM Sans', sans-serif;
    --font-mono: 'DM Mono', monospace;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  .chat-root {
    display: flex;
    height: 100vh;
    background: var(--bg-base);
    color: var(--text-primary);
    font-family: var(--font-body);
    font-size: 14px;
    line-height: 1.6;
    overflow: hidden;
  }

  /* ── Sidebar ─────────────────────────────────────── */
  .sidebar {
    width: var(--sidebar-w);
    min-width: var(--sidebar-w);
    background: var(--bg-surface);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    padding: 24px 16px;
    gap: 8px;
  }

  .sidebar-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 4px 20px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 8px;
  }

  .brand-mark {
    width: 32px;
    height: 32px;
    color: var(--accent);
    flex-shrink: 0;
  }
  .brand-mark svg { width: 100%; height: 100%; }

  .brand-name {
    font-family: var(--font-serif);
    font-size: 18px;
    color: var(--text-primary);
    letter-spacing: 0.02em;
  }

  .sidebar-nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 13.5px;
    font-weight: 400;
    transition: background 0.18s ease, color 0.18s ease;
    position: relative;
  }
  .nav-item svg { width: 16px; height: 16px; flex-shrink: 0; }
  .nav-item:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
  .nav-item--active {
    background: var(--accent-dim);
    color: var(--accent);
  }
  .nav-item--active:hover {
    background: var(--accent-dim);
    color: var(--accent-hover);
  }
  .nav-item--active::before {
    content: '';
    position: absolute;
    left: 0;
    top: 6px;
    bottom: 6px;
    width: 2px;
    background: var(--accent);
    border-radius: 2px;
  }

  .sidebar-footer {
    border-top: 1px solid var(--border);
    padding-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .client-badge {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 4px;
  }
  .client-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #4caf78;
    box-shadow: 0 0 6px rgba(76,175,120,0.5);
    flex-shrink: 0;
  }
  .client-name {
    font-size: 12px;
    color: var(--text-secondary);
    font-family: var(--font-mono);
  }

  .stream-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 4px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .toggle {
    width: 34px;
    height: 18px;
    border-radius: 9px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    cursor: pointer;
    position: relative;
    transition: background 0.2s ease, border-color 0.2s ease;
  }
  .toggle--on {
    background: var(--accent-dim);
    border-color: var(--accent);
  }
  .toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--text-muted);
    transition: transform 0.2s ease, background 0.2s ease;
  }
  .toggle--on .toggle-thumb {
    transform: translateX(16px);
    background: var(--accent);
  }

  /* ── Main ────────────────────────────────────────── */
  .chat-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  .chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 28px 18px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-base);
    flex-shrink: 0;
  }

  .chat-header-left { display: flex; flex-direction: column; gap: 2px; }

  .chat-title {
    font-family: var(--font-serif);
    font-size: 20px;
    font-weight: 400;
    color: var(--text-primary);
    letter-spacing: 0.01em;
  }

  .chat-subtitle {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-muted);
    letter-spacing: 0.04em;
  }

  .btn-clear {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: var(--radius-sm);
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-secondary);
    font-size: 12.5px;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    font-family: var(--font-body);
  }
  .btn-clear svg { width: 13px; height: 13px; }
  .btn-clear:hover {
    background: var(--bg-hover);
    border-color: var(--border-hover);
    color: var(--text-primary);
  }

  /* ── Messages ────────────────────────────────────── */
  .messages-area {
    flex: 1;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--bg-elevated) transparent;
  }
  .messages-area::-webkit-scrollbar { width: 5px; }
  .messages-area::-webkit-scrollbar-thumb { background: var(--bg-elevated); border-radius: 3px; }

  .messages-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 24px 28px 16px;
    max-width: 820px;
    margin: 0 auto;
    width: 100%;
  }

  .message-row {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    animation: msg-in 0.22s ease both;
  }
  @keyframes msg-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .message-row--user { flex-direction: row-reverse; }

  .avatar {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-secondary);
    flex-shrink: 0;
    margin-bottom: 18px;
  }
  .avatar--user {
    background: var(--accent-dim);
    border-color: var(--user-border);
    color: var(--accent);
  }

  .bubble {
    max-width: 72%;
    padding: 12px 16px;
    border-radius: var(--radius);
    position: relative;
  }

  .bubble--assistant {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-bottom-left-radius: 4px;
  }

  .bubble--user {
    background: var(--user-bg);
    border: 1px solid var(--user-border);
    border-bottom-right-radius: 4px;
    text-align: right;
  }

  .bubble--thinking {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 14px 18px;
    min-width: 60px;
  }

  .bubble-content {
    font-size: 14px;
    line-height: 1.65;
    color: var(--text-primary);
    white-space: pre-wrap;
    word-break: break-word;
  }

  .cursor-blink {
    display: inline-block;
    margin-left: 2px;
    animation: blink 0.85s step-start infinite;
    color: var(--accent);
  }
  @keyframes blink { 50% { opacity: 0; } }

  .bubble-time {
    display: block;
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-muted);
    margin-top: 6px;
  }
  .bubble--user .bubble-time { text-align: right; }

  /* Sources */
  .sources-section {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--border);
  }
  .sources-label {
    font-family: var(--font-mono);
    font-size: 10px;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    text-transform: uppercase;
    margin-bottom: 8px;
  }
  .sources-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .source-card {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: var(--radius-sm);
    background: var(--bg-surface);
    border: 1px solid var(--border);
    text-decoration: none;
    color: var(--text-secondary);
    font-size: 12px;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    overflow: hidden;
  }
  .source-card:hover {
    background: var(--bg-hover);
    border-color: var(--border-hover);
    color: var(--text-primary);
  }
  .source-score {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--accent);
    background: var(--accent-dim);
    padding: 1px 5px;
    border-radius: 4px;
    flex-shrink: 0;
  }
  .source-title {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .source-date {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  /* Dot pulse animation */
  .dot-pulse {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--text-muted);
    display: inline-block;
    animation: dot-pulse 1.4s ease-in-out infinite;
  }
  .dot-pulse:nth-child(2) { animation-delay: 0.2s; }
  .dot-pulse:nth-child(3) { animation-delay: 0.4s; }
  @keyframes dot-pulse {
    0%, 80%, 100% { transform: scale(0.7); opacity: 0.4; }
    40% { transform: scale(1); opacity: 1; }
  }

  /* ── Empty state ─────────────────────────────────── */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 12px;
    padding: 40px 28px;
    text-align: center;
  }

  .empty-logo {
    width: 48px;
    height: 48px;
    color: var(--accent);
    opacity: 0.6;
    margin-bottom: 4px;
  }
  .empty-logo svg { width: 100%; height: 100%; }

  .empty-title {
    font-family: var(--font-serif);
    font-size: 26px;
    font-weight: 400;
    color: var(--text-primary);
    letter-spacing: 0.01em;
  }

  .empty-subtitle {
    font-size: 13.5px;
    color: var(--text-secondary);
    margin-bottom: 8px;
  }

  .suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
    max-width: 560px;
  }

  .suggestion-pill {
    padding: 8px 14px;
    border-radius: 20px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    font-size: 13px;
    cursor: pointer;
    transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.18s ease;
    font-family: var(--font-body);
    text-align: left;
    line-height: 1.4;
  }
  .suggestion-pill:hover {
    background: var(--bg-hover);
    border-color: var(--accent);
    color: var(--text-primary);
    transform: translateY(-1px);
  }

  /* ── Input area ──────────────────────────────────── */
  .input-area {
    padding: 16px 28px 20px;
    border-top: 1px solid var(--border);
    background: var(--bg-base);
    flex-shrink: 0;
    max-width: 820px;
    margin: 0 auto;
    width: 100%;
  }

  .input-wrapper {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px 12px;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .input-wrapper:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-dim);
  }

  .chat-textarea {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-primary);
    font-family: var(--font-body);
    font-size: 14px;
    line-height: 1.6;
    resize: none;
    min-height: 22px;
    max-height: 160px;
    padding: 0;
  }
  .chat-textarea::placeholder { color: var(--text-muted); }
  .chat-textarea:disabled { opacity: 0.5; }

  .input-actions { display: flex; align-items: center; }

  .btn-send {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    flex-shrink: 0;
  }
  .btn-send svg { width: 14px; height: 14px; }
  .btn-send--active {
    background: var(--accent-dim);
    border-color: var(--accent);
    color: var(--accent);
  }
  .btn-send--active:hover {
    background: var(--accent);
    color: var(--bg-base);
  }
  .btn-send:disabled { opacity: 0.4; cursor: not-allowed; }

  .btn-stop {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: rgba(200,60,60,0.15);
    border: 1px solid rgba(200,60,60,0.3);
    color: #e06060;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.15s ease;
    flex-shrink: 0;
  }
  .btn-stop svg { width: 12px; height: 12px; }
  .btn-stop:hover { background: rgba(200,60,60,0.25); }

  .input-hint {
    font-size: 11px;
    color: var(--text-muted);
    text-align: center;
    margin-top: 8px;
    font-family: var(--font-mono);
  }
  .input-hint-accent { color: var(--accent); opacity: 0.8; }
`;