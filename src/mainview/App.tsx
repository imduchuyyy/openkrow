import { useState, useRef, useEffect } from "react";
import { rpc } from "./rpc";
import type { ChatMessage } from "../shared/types";

type AppState = "idle" | "loading" | "ready";

export default function App() {
  const [state, setState] = useState<AppState>("idle");
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSelectFolder = async () => {
    setError(null);
    const result = await rpc.request.selectFolder({});
    if (result.path) {
      setState("loading");
      setWorkspacePath(result.path);
      const start = await rpc.request.startWorkspace({ path: result.path });
      if (start.success) {
        // Create a session
        const session = await rpc.request.createSession({});
        if ("sessionId" in session) {
          setSessionId(session.sessionId);
          setState("ready");
        } else {
          setState("idle");
          setError(session.error);
        }
      } else {
        setState("idle");
        setError(start.error ?? "Failed to start workspace");
      }
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !sessionId || sending) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: input.trim(),
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setSending(true);

    const res = await rpc.request.sendMessage({ sessionId, text: userMessage.text });
    if ("message" in res) {
      setMessages((prev) => [...prev, res.message]);
    } else {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: `Error: ${res.error}`, createdAt: Date.now() },
      ]);
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Folder picker screen
  if (state !== "ready") {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-neutral-900 text-neutral-200 font-sans gap-6">
        <h1 className="text-4xl font-light tracking-tight">Krow</h1>
        <p className="text-neutral-400 text-sm max-w-xs text-center">
          Select a workspace folder to get started.
        </p>
        <button
          onClick={handleSelectFolder}
          disabled={state === "loading"}
          className="px-5 py-2.5 bg-white text-neutral-900 rounded-lg text-sm font-medium hover:bg-neutral-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {state === "loading" ? "Starting..." : "Open Folder"}
        </button>
        {error && <p className="text-red-400 text-xs max-w-xs text-center">{error}</p>}
      </div>
    );
  }

  // Chat screen
  return (
    <div className="flex flex-col h-screen bg-neutral-900 text-neutral-200 font-sans">
      {/* Header */}
      <div className="flex items-center px-4 py-3 border-b border-neutral-800 shrink-0" style={{ paddingTop: "2rem" }}>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-medium truncate">Krow</h1>
          <p className="text-xs text-neutral-500 truncate font-mono">{workspacePath}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-neutral-600 text-sm">Send a message to start.</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-neutral-800 text-neutral-200"
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="bg-neutral-800 text-neutral-400 rounded-xl px-4 py-2.5 text-sm">
              Thinking...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-neutral-800 px-4 py-3">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Krow..."
            rows={1}
            className="flex-1 bg-neutral-800 text-neutral-200 rounded-lg px-4 py-2.5 text-sm resize-none outline-none placeholder:text-neutral-500 focus:ring-1 focus:ring-neutral-600"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="px-4 py-2.5 bg-white text-neutral-900 rounded-lg text-sm font-medium hover:bg-neutral-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
