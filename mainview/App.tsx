import { useState, useEffect, useRef } from "react";
import { rpc, onStreamEvent } from "./rpc";
import type { ChatMessage, MessagePart, SessionInfo, QuestionRequest, AgentInfo } from "../shared/types";
import MessageList from "../components/MessageList";
import ChatInput from "../components/ChatInput";
import QuestionPrompt from "../components/QuestionPrompt";
import { KrowLogo } from "../components/KrowLogo";
import WorkspaceSetup from "../components/WorkspaceSetup";
import SettingsView from "../components/SettingsView";
import FileExplorer from "../components/FileExplorer";
import FileViewer from "../components/FileViewer";

type AppState = "workspace-setup" | "loading" | "ready" | "error";
type MainView = "chat" | "file" | "settings";

export default function App() {
  const [state, setState] = useState<AppState>("workspace-setup");
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [selectedModel, setSelectedModel] = useState<{ providerID: string; modelID: string } | null>({ providerID: "opencode", modelID: "big-pickle" });
  const [activeQuestion, setActiveQuestion] = useState<QuestionRequest | null>(null);
  const [settingsRefreshKey, setSettingsRefreshKey] = useState(0);
  const [loadingMessage, setLoadingMessage] = useState("Initializing...");
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [activeAgent, setActiveAgent] = useState<string | null>("cofounder");
  const [lastWorkspacePath, setLastWorkspacePath] = useState<string | null>(null);
  const [pendingSetupDetails, setPendingSetupDetails] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<MainView>("chat");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const sendingRef = useRef(false);

  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { sendingRef.current = sending; }, [sending]);

  const refreshSessions = async () => {
    const res = await rpc.request.listSessions({});
    if ("sessions" in res) setSessions(res.sessions);
  };

  // Listen to streaming events
  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(onStreamEvent("partUpdated", (payload: { sessionId: string; messageId: string; part: MessagePart; agent?: string; agentColor?: string }) => {
      const { messageId, part, agent, agentColor } = payload;
      if (payload.sessionId !== sessionIdRef.current) return;

      setMessages((prev) => {
        const existing = prev.find((m) => m.id === messageId);
        if (existing) {
          const parts = [...(existing.parts ?? [])];
          const partIdx = parts.findIndex((p) => p.id === part.id);
          if (partIdx >= 0) parts[partIdx] = part;
          else parts.push(part);
          const text = parts.filter((p) => p.type === "text").map((p) => (p as any).text).join("");
          return prev.map((m) => m.id === messageId ? { ...m, parts, text, agent: agent ?? m.agent, agentColor: agentColor ?? m.agentColor } : m);
        }
        const text = part.type === "text" ? (part as any).text : "";
        return [...prev, { id: messageId, role: "assistant" as const, text, createdAt: Date.now(), isLoading: true, parts: [part], agent, agentColor }];
      });
    }));

    unsubs.push(onStreamEvent("partDelta", (payload: { sessionId: string; messageId: string; partId: string; field: string; delta: string }) => {
      const { messageId, partId, field, delta } = payload;
      setMessages((prev) => {
        const msg = prev.find((m) => m.id === messageId);
        if (!msg || !msg.parts) return prev;
        const partIdx = msg.parts.findIndex((p) => p.id === partId);
        if (partIdx < 0) return prev;
        const part = msg.parts[partIdx];
        if (field !== "text" || (part.type !== "text" && part.type !== "reasoning")) return prev;
        const updatedPart = { ...part, text: (part.text ?? "") + delta };
        const parts = [...msg.parts];
        parts[partIdx] = updatedPart;
        const text = parts.filter((p) => p.type === "text").map((p) => (p as any).text).join("");
        return prev.map((m) => m.id === messageId ? { ...m, parts, text } : m);
      });
    }));

    unsubs.push(onStreamEvent("messageComplete", (payload: { sessionId: string; messageId: string }) => {
      if (payload.sessionId !== sessionIdRef.current) return;
      setSending(false);
      setMessages((prev) => prev.map((m) => m.id === payload.messageId ? { ...m, isLoading: false } : m));
      refreshSessions();
    }));

    unsubs.push(onStreamEvent("sessionStatus", (payload: { sessionId: string; status: string }) => {
      if (payload.sessionId !== sessionIdRef.current) return;
      if (payload.status === "busy") setSending(true);
      else if (payload.status === "idle") setSending(false);
    }));

    unsubs.push(onStreamEvent("sessionError", (payload: { sessionId: string; error: string }) => {
      if (payload.sessionId !== sessionIdRef.current) return;
      setSending(false);
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", text: `Error: ${payload.error}`, createdAt: Date.now() }]);
    }));

    unsubs.push(onStreamEvent("questionAsked", (payload: QuestionRequest) => {
      if (payload.sessionID !== sessionIdRef.current) return;
      setActiveQuestion(payload);
    }));

    unsubs.push(onStreamEvent("agentSwitched", (payload: { sessionId: string; agent: string; color: string }) => {
      if (payload.sessionId !== sessionIdRef.current) return;
      setActiveAgent(payload.agent);
    }));

    unsubs.push(onStreamEvent("settingsChanged", () => setSettingsRefreshKey((k) => k + 1)));
    unsubs.push(onStreamEvent("downloadProgress", (payload: { message: string }) => setLoadingMessage(payload.message)));

    return () => unsubs.forEach((fn) => fn());
  }, []);

  // Check for last workspace on mount
  useEffect(() => {
    (async () => {
      const res = await rpc.request.getLastWorkspace({});
      if (res.path) {
        setLastWorkspacePath(res.path);
        const validation = await rpc.request.validateWorkspace({ path: res.path });
        if (!("error" in validation) && validation.hasAgentsMd) {
          handleWorkspaceReady(res.path, false);
          return;
        }
      }
      setState("workspace-setup");
    })();
  }, []);

  const handleWorkspaceReady = async (path: string, isNew: boolean, projectDetails?: string) => {
    setState("loading");
    setLoadingMessage("Starting workspace...");
    try {
      const init = await rpc.request.initWorkspaceWithPath({ path });
      if ("error" in init) { setState("error"); setError(init.error); return; }
      const agentsRes = await rpc.request.listAgents({});
      if ("agents" in agentsRes) setAgents(agentsRes.agents);
      const session = await rpc.request.createSession({});
      if ("sessionId" in session) {
        setSessionId(session.sessionId);
        if (session.history?.length > 0) setMessages(session.history);
        setState("ready");
        refreshSessions();
        if (isNew && projectDetails) {
          setSending(true);
          await rpc.request.sendSetupPrompt({ sessionId: session.sessionId, projectDetails });
        }
      } else { setState("error"); setError(session.error); }
    } catch (err: any) { setState("error"); setError(err?.message ?? String(err)); }
  };

  const handleSend = async (text: string) => {
    if (!sessionId || sending) return;
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text, createdAt: Date.now() }]);
    setSending(true);
    setActiveView("chat");
    const res = await rpc.request.sendMessage({ sessionId, text, ...(selectedModel ? { model: selectedModel } : {}) });
    if ("error" in res) {
      setSending(false);
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", text: `Error: ${res.error}`, createdAt: Date.now() }]);
    }
  };

  const handleStopSession = async () => {
    const currentSessionId = sessionIdRef.current;
    if (!currentSessionId || !sendingRef.current) return;
    const res = await rpc.request.stopSession({ sessionId: currentSessionId });
    if ("error" in res) {
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "assistant", text: `Error: ${res.error}`, createdAt: Date.now() }]);
      return;
    }
    setSending(false);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && sendingRef.current) { event.preventDefault(); void handleStopSession(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleNewSession = async () => {
    const res = await rpc.request.newSession({});
    if ("sessionId" in res) {
      setSessionId(res.sessionId);
      setMessages([]);
      setSending(false);
      setActiveQuestion(null);
      setActiveAgent("cofounder");
      setActiveView("chat");
      refreshSessions();
    }
  };

  const handleSelectSession = async (session: SessionInfo) => {
    const res = await rpc.request.loadSession({ sessionId: session.id });
    if ("sessionId" in res) {
      setSessionId(res.sessionId);
      setMessages(res.history);
      setSending(false);
      setActiveQuestion(null);
      setActiveView("chat");
    }
  };

  const handleFileSelect = (path: string) => {
    setSelectedFile(path);
    setActiveView("file");
  };

  // ─── Workspace Setup Screen ───
  if (state === "workspace-setup") {
    return (
      <WorkspaceSetup
        initialPath={null}
        loadingMessage={loadingMessage}
        onWorkspaceReady={(path: string, isNew: boolean, projectDetails?: string) => handleWorkspaceReady(path, isNew, projectDetails)}
      />
    );
  }

  // ─── Loading / Error Screen ───
  if (state !== "ready") {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0a0a0a] relative z-10">
        <div className="flex flex-col items-center gap-5">
          <KrowLogo className="w-8 h-8 text-[#fb923c]" />
          {state === "loading" && (
            <div className="flex flex-col items-center gap-2">
              <div className="w-4 h-4 border-2 border-[#333] border-t-[#fb923c] rounded-full animate-spin" />
              <p className="font-mono text-[11px] text-[#555]">{loadingMessage}</p>
            </div>
          )}
          {state === "error" && (
            <p className="text-red-400/80 text-[12px] max-w-xs text-center font-mono">{error}</p>
          )}
        </div>
      </div>
    );
  }

  // ─── Main App Layout ───
  return (
    <div className="flex h-screen bg-[#0a0a0a] text-[#d4d4d4]">
      {/* Left sidebar - File Explorer */}
      <div className="w-56 flex flex-col border-r border-[#1e1e1e] shrink-0">
        {/* Drag area + session controls */}
        <div
          className="flex items-center justify-between px-3 py-2 border-b border-[#1e1e1e] shrink-0"
          style={{ paddingTop: "1.75rem", WebkitAppRegion: "drag" } as any}
        >
          <span className="font-mono text-[10px] text-[#555] uppercase tracking-wider" style={{ WebkitAppRegion: "no-drag" } as any}>
            Explorer
          </span>
          <div className="flex items-center gap-1" style={{ WebkitAppRegion: "no-drag" } as any}>
            <button
              onClick={handleNewSession}
              className="p-1 text-[#555] hover:text-[#ccc] transition-colors"
              title="New session"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button
              onClick={() => setActiveView("settings")}
              className="p-1 text-[#555] hover:text-[#ccc] transition-colors"
              title="Settings"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>

        {/* File tree */}
        <div className="flex-1 overflow-y-auto">
          <FileExplorer onFileSelect={handleFileSelect} selectedFile={selectedFile} />
        </div>

        {/* Session list at bottom */}
        <div className="border-t border-[#1e1e1e] max-h-40 overflow-y-auto">
          <div className="px-3 py-1.5">
            <span className="font-mono text-[10px] text-[#555] uppercase tracking-wider">Sessions</span>
          </div>
          {sessions.slice(0, 8).map((s) => (
            <button
              key={s.id}
              onClick={() => handleSelectSession(s)}
              className={`w-full text-left px-3 py-1.5 font-mono text-[11px] truncate transition-colors ${
                s.id === sessionId ? "text-[#fb923c] bg-[#fb923c]/5" : "text-[#666] hover:text-[#aaa] hover:bg-[#1a1a1a]"
              }`}
            >
              {s.title}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeView === "settings" ? (
          <>
            <div className="shrink-0" style={{ height: "1.75rem", WebkitAppRegion: "drag" } as any} />
            <SettingsView onBack={() => setActiveView("chat")} />
          </>
        ) : activeView === "file" && selectedFile ? (
          <>
            <div className="shrink-0" style={{ height: "1.75rem", WebkitAppRegion: "drag" } as any} />
            <FileViewer filePath={selectedFile} onClose={() => { setSelectedFile(null); setActiveView("chat"); }} />
          </>
        ) : (
          <>
            {/* Chat topbar */}
            <div
              className="flex items-center justify-between px-4 py-2 border-b border-[#1e1e1e] shrink-0"
              style={{ paddingTop: "1.75rem", WebkitAppRegion: "drag" } as any}
            >
              <div className="flex items-center gap-2" style={{ WebkitAppRegion: "no-drag" } as any}>
                <KrowLogo className="w-4 h-4 text-[#fb923c]" />
                <span className="font-mono text-[11px] text-[#666]">
                  {sending ? "working..." : "ready"}
                </span>
              </div>
            </div>

            {/* Messages */}
            <MessageList messages={messages} sending={sending} />

            {/* Question prompt */}
            {activeQuestion && (
              <QuestionPrompt question={activeQuestion} onDismiss={() => setActiveQuestion(null)} />
            )}

            {/* Input */}
            <ChatInput onSend={handleSend} onStop={handleStopSession} disabled={sending || !!activeQuestion} sending={sending} onModelChange={setSelectedModel} refreshKey={settingsRefreshKey} />
          </>
        )}
      </div>
    </div>
  );
}
