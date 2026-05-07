import { useState, useEffect } from "react";
import { rpc, onStreamEvent } from "./rpc";
import type { ChatMessage, MessagePart } from "../shared/types";
import FolderPicker from "./components/FolderPicker";
import FileExplorer from "./components/FileExplorer";
import FileViewer from "./components/FileViewer";
import MessageList from "./components/MessageList";
import ChatInput from "./components/ChatInput";
import ModelSelector from "./components/ModelSelector";

type AppState = "idle" | "loading" | "ready";

export default function App() {
  const [state, setState] = useState<AppState>("idle");
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [selectedModel, setSelectedModel] = useState<{ providerID: string; modelID: string } | null>(null);
  const [openFile, setOpenFile] = useState<string | null>(null);

  // Listen to streaming events
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(onStreamEvent("partUpdated", (payload: { sessionId: string; messageId: string; part: MessagePart; delta?: string }) => {
      const { messageId, part } = payload;

      setMessages((prev) => {
        const existing = prev.find((m) => m.id === messageId);
        if (existing) {
          const parts = [...(existing.parts ?? [])];
          const partIdx = parts.findIndex((p) => p.id === part.id);
          if (partIdx >= 0) {
            parts[partIdx] = part;
          } else {
            parts.push(part);
          }
          const text = parts
            .filter((p) => p.type === "text")
            .map((p) => (p as any).text)
            .join("");
          return prev.map((m) => m.id === messageId ? { ...m, parts, text } : m);
        }
        const text = part.type === "text" ? (part as any).text : "";
        return [...prev, {
          id: messageId,
          role: "assistant" as const,
          text,
          createdAt: Date.now(),
          isLoading: true,
          parts: [part],
        }];
      });
    }));

    unsubs.push(onStreamEvent("messageComplete", (payload: { messageId: string }) => {
      setSending(false);
      setMessages((prev) =>
        prev.map((m) => m.id === payload.messageId ? { ...m, isLoading: false } : m)
      );
    }));

    unsubs.push(onStreamEvent("sessionStatus", (payload: { status: string }) => {
      if (payload.status === "idle") setSending(false);
    }));

    unsubs.push(onStreamEvent("sessionError", (payload: { error: string }) => {
      setSending(false);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: `Error: ${payload.error}`, createdAt: Date.now() },
      ]);
    }));

    return () => unsubs.forEach((fn) => fn());
  }, []);

  const handleSelectFolder = async () => {
    setError(null);
    const result = await rpc.request.selectFolder({});
    if (result.path) {
      setState("loading");
      setWorkspacePath(result.path);
      const start = await rpc.request.startWorkspace({ path: result.path });
      if (start.success) {
        const session = await rpc.request.createSession({});
        if ("sessionId" in session) {
          setSessionId(session.sessionId);
          if (session.history && session.history.length > 0) {
            setMessages(session.history);
          }
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

  const handleSend = async (text: string) => {
    if (!sessionId || sending) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setSending(true);

    const res = await rpc.request.sendMessage({
      sessionId,
      text,
      ...(selectedModel ? { model: selectedModel } : {}),
    });
    if ("error" in res) {
      setSending(false);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", text: `Error: ${res.error}`, createdAt: Date.now() },
      ]);
    }
  };

  if (state !== "ready") {
    return (
      <FolderPicker
        onSelectFolder={handleSelectFolder}
        loading={state === "loading"}
        error={error}
      />
    );
  }

  return (
    <div className="flex h-screen bg-neutral-900 text-neutral-200 font-sans">
      {/* Left Sidebar - File Explorer */}
      <div className="w-60 shrink-0 h-full">
        <FileExplorer workspacePath={workspacePath!} onFileSelect={setOpenFile} />
      </div>

      {/* Center - Chat Panel */}
      <div className="flex-1 flex flex-col min-w-0 border-l border-r border-neutral-800">
        {/* Title bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800 shrink-0" style={{ paddingTop: "1.75rem" }}>
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-sm font-medium">Krow</h1>
            <span className="text-[10px] text-neutral-600 font-mono truncate">{workspacePath}</span>
          </div>
          <ModelSelector onModelChange={setSelectedModel} />
        </div>

        {/* Messages */}
        <MessageList messages={messages} sending={sending} />

        {/* Input */}
        <ChatInput onSend={handleSend} disabled={sending} />
      </div>

      {/* Right Panel - File Viewer */}
      <div className="w-[400px] shrink-0 h-full">
        <FileViewer filePath={openFile} onClose={() => setOpenFile(null)} />
      </div>
    </div>
  );
}
