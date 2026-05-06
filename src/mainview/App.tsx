import { useState, useEffect, useRef } from "react";
import { rpc, onStreamEvent } from "./rpc";
import type { ChatMessage } from "../shared/types";
import FolderPicker from "./components/FolderPicker";
import ChatHeader from "./components/ChatHeader";
import MessageList from "./components/MessageList";
import ChatInput from "./components/ChatInput";

type AppState = "idle" | "loading" | "ready";

export default function App() {
  const [state, setState] = useState<AppState>("idle");
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [selectedModel, setSelectedModel] = useState<{ providerID: string; modelID: string } | null>(null);
  const streamingTextRef = useRef<Map<string, string>>(new Map());

  // Listen to streaming events
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(onStreamEvent("streamDelta", (payload) => {
      const { messageId, text } = payload;
      streamingTextRef.current.set(messageId, text);

      setMessages((prev) => {
        const existing = prev.find((m) => m.id === messageId);
        if (existing) {
          return prev.map((m) => m.id === messageId ? { ...m, text } : m);
        }
        return [...prev, {
          id: messageId,
          role: "assistant" as const,
          text,
          createdAt: Date.now(),
          isLoading: true,
        }];
      });
    }));

    unsubs.push(onStreamEvent("messageComplete", (payload) => {
      const { messageId } = payload;
      setSending(false);
      setMessages((prev) =>
        prev.map((m) => m.id === messageId ? { ...m, isLoading: false } : m)
      );
      streamingTextRef.current.delete(messageId);
    }));

    unsubs.push(onStreamEvent("sessionStatus", (payload) => {
      if (payload.status === "idle") {
        setSending(false);
      }
    }));

    unsubs.push(onStreamEvent("sessionError", (payload) => {
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
    // If success, streaming events will build the assistant message
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
    <div className="flex flex-col h-screen bg-neutral-900 text-neutral-200 font-sans">
      <ChatHeader workspacePath={workspacePath} onModelChange={setSelectedModel} />
      <MessageList messages={messages} sending={sending} />
      <ChatInput onSend={handleSend} disabled={sending} />
    </div>
  );
}
