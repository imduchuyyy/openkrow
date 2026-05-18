import type { OpencodeClient } from "@opencode-ai/sdk/v2";
import type { MessagePart, QuestionRequest } from "../shared/types";
import { agentMeta } from "./agents";

export type RpcSend = {
  partUpdated: (payload: { sessionId: string; messageId: string; part: MessagePart; agent?: string; agentColor?: string }) => void;
  partDelta: (payload: { sessionId: string; messageId: string; partId: string; field: string; delta: string }) => void;
  messageComplete: (payload: { sessionId: string; messageId: string }) => void;
  sessionStatus: (payload: { sessionId: string; status: "idle" | "busy" | "retry" }) => void;
  sessionError: (payload: { sessionId: string; error: string }) => void;
  questionAsked: (payload: QuestionRequest) => void;
  agentSwitched: (payload: { sessionId: string; agent: string; color: string }) => void;
};

type QueuedEvent = {
  type: "partUpdated" | "partDelta" | "messageComplete" | "sessionStatus" | "sessionError" | "questionAsked" | "agentSwitched";
  payload: any;
  key?: string; // for coalescing
};

/**
 * Listens to opencode SSE events and forwards relevant ones to the webview.
 * 
 * Approach (matching opencode desktop app):
 * - Parts stored independently; no role filtering on parts
 * - User message IDs tracked to reject their parts
 * - message.part.delta handled for incremental text streaming
 * - Events coalesced and flushed every ~16ms for batching
 */
export class EventStream {
  private userMessageIds = new Set<string>(); // messages confirmed as non-assistant
  private messageAgentMap = new Map<string, string>(); // messageID → agent name
  private client: InstanceType<typeof OpencodeClient>;
  public send: RpcSend;

  // Event coalescing
  private queue: QueuedEvent[] = [];
  private coalesced = new Map<string, number>(); // key → queue index
  private staleDeltas = new Set<string>(); // partID keys whose delta is stale (full update arrived)
  private flushScheduled = false;

  constructor(client: InstanceType<typeof OpencodeClient>, send: RpcSend) {
    this.client = client;
    this.send = send;
  }

  async start(): Promise<void> {
    try {
      const events = await this.client.event.subscribe();
      for await (const event of (events as any).stream) {
        this.handleEvent(event as any);
      }
    } catch (err: any) {
      console.error("Event stream error:", err?.message);
    }
  }

  private getAgentColor(agentName: string): string {
    return agentMeta.find((a) => a.name === agentName)?.color ?? "#6B7280";
  }

  private scheduleFlush(): void {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    setTimeout(() => this.flush(), 16);
  }

  private flush(): void {
    this.flushScheduled = false;
    const events = this.queue;
    const stale = this.staleDeltas;
    this.queue = [];
    this.coalesced.clear();
    this.staleDeltas = new Set();

    for (const evt of events) {
      // Skip stale deltas (a full part.updated arrived after this delta was queued)
      if (evt.type === "partDelta" && stale.has(evt.key!)) continue;

      switch (evt.type) {
        case "partUpdated":
          this.send.partUpdated(evt.payload);
          break;
        case "partDelta":
          this.send.partDelta(evt.payload);
          break;
        case "messageComplete":
          this.send.messageComplete(evt.payload);
          break;
        case "sessionStatus":
          this.send.sessionStatus(evt.payload);
          break;
        case "sessionError":
          this.send.sessionError(evt.payload);
          break;
        case "questionAsked":
          this.send.questionAsked(evt.payload);
          break;
        case "agentSwitched":
          this.send.agentSwitched(evt.payload);
          break;
      }
    }
  }

  private enqueue(evt: QueuedEvent): void {
    if (evt.key) {
      const existing = this.coalesced.get(evt.key);
      if (existing !== undefined) {
        // Replace earlier event with same key (coalesce)
        this.queue[existing] = evt;
        // If a full part update replaces an earlier one, mark any pending deltas as stale
        if (evt.type === "partUpdated") {
          this.staleDeltas.add(evt.payload.messageId + ":" + evt.payload.part.id);
        }
        return;
      }
      this.coalesced.set(evt.key, this.queue.length);
    }
    this.queue.push(evt);
    this.scheduleFlush();
  }

  private handleEvent(evt: any): void {
    switch (evt.type) {
      case "message.updated":
        this.onMessageUpdated(evt.properties);
        break;
      case "message.completed":
        this.onMessageCompleted(evt.properties);
        break;
      case "message.part.updated":
        this.onPartUpdated(evt.properties);
        break;
      case "message.part.delta":
        this.onPartDelta(evt.properties);
        break;
      case "session.status":
        this.onSessionStatus(evt.properties);
        break;
      case "session.error":
        this.onSessionError(evt.properties);
        break;
      case "question.asked":
        this.onQuestionAsked(evt.properties);
        break;
    }
  }

  private onMessageUpdated(props: any): void {
    const { info } = props;
    if (info.role !== "assistant") {
      this.userMessageIds.add(info.id);
      return;
    }

    // Track agent for this message
    const agentName = info.agent ?? "cofounder";
    this.messageAgentMap.set(info.id, agentName);

    this.enqueue({
      type: "agentSwitched",
      payload: { sessionId: info.sessionID, agent: agentName, color: this.getAgentColor(agentName) },
      key: `agent:${info.sessionID}`,
    });

    if (info.time?.completed) {
      this.enqueue({
        type: "messageComplete",
        payload: { sessionId: info.sessionID, messageId: info.id },
      });
      this.messageAgentMap.delete(info.id);
    }
  }

  private onMessageCompleted(props: any): void {
    const { info } = props;
    if (!info) return;
    if (this.userMessageIds.has(info.id)) return;
    this.enqueue({
      type: "messageComplete",
      payload: { sessionId: info.sessionID, messageId: info.id },
    });
    this.messageAgentMap.delete(info.id);
  }

  private onPartUpdated(props: any): void {
    const { part } = props;
    if (!part?.type) return;

    // Skip parts for confirmed user messages
    if (this.userMessageIds.has(part.messageID)) return;

    // Skip step-start/step-finish for cleaner output
    if (part.type === "step-start" || part.type === "step-finish") return;

    let messagePart: MessagePart | null = null;
    switch (part.type) {
      case "text":
        messagePart = { id: part.id, type: "text", sessionID: part.sessionID, messageID: part.messageID, text: part.text ?? "" };
        break;
      case "reasoning":
        messagePart = { id: part.id, type: "reasoning", sessionID: part.sessionID, messageID: part.messageID, text: part.text ?? "" };
        break;
      case "tool":
        messagePart = { id: part.id, type: "tool", sessionID: part.sessionID, messageID: part.messageID, tool: part.tool, state: part.state };
        break;
    }

    if (!messagePart) return;

    const agent = this.messageAgentMap.get(part.messageID);
    const key = `part:${part.messageID}:${part.id}`;

    this.enqueue({
      type: "partUpdated",
      payload: {
        sessionId: part.sessionID,
        messageId: part.messageID,
        part: messagePart,
        agent,
        agentColor: agent ? this.getAgentColor(agent) : undefined,
      },
      key,
    });

    // Mark any pending deltas for this part as stale (full update supersedes)
    this.staleDeltas.add(part.messageID + ":" + part.id);
  }

  private onPartDelta(props: any): void {
    const { messageID, partID, field, delta } = props;
    if (!messageID || !partID || !delta) return;

    // Skip deltas for confirmed user messages
    if (this.userMessageIds.has(messageID)) return;

    // Only forward text/reasoning deltas
    if (field !== "text") return;

    this.enqueue({
      type: "partDelta",
      payload: { sessionId: "", messageId: messageID, partId: partID, field, delta },
      key: `delta:${messageID}:${partID}:${Date.now()}`, // unique key (deltas don't coalesce — they append)
    });
  }

  private onSessionStatus(props: any): void {
    const { sessionID, status } = props;
    const statusType = typeof status === "string" ? status : status?.type ?? status;
    this.enqueue({
      type: "sessionStatus",
      payload: { sessionId: sessionID, status: statusType },
      key: `status:${sessionID}`,
    });
  }

  private onSessionError(props: any): void {
    const { sessionID, error } = props;
    const errorMsg = error?.data?.message ?? error?.name ?? "Unknown error";
    this.enqueue({
      type: "sessionError",
      payload: { sessionId: sessionID ?? "", error: errorMsg },
    });
  }

  private onQuestionAsked(props: any): void {
    this.enqueue({
      type: "questionAsked",
      payload: { id: props.id, sessionID: props.sessionID, questions: props.questions },
    });
  }
}
