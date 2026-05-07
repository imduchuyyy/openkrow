import type { OpencodeClient } from "@opencode-ai/sdk";
import type { MessagePart } from "../shared/types";

// Track which messageIDs belong to assistant messages
const assistantMessageIds = new Set<string>();

type RpcSend = {
  partUpdated: (payload: { sessionId: string; messageId: string; part: MessagePart; delta?: string }) => void;
  messageComplete: (payload: { sessionId: string; messageId: string }) => void;
  sessionStatus: (payload: { sessionId: string; status: "idle" | "busy" | "retry" }) => void;
  sessionError: (payload: { sessionId: string; error: string }) => void;
};

export async function startEventStream(client: InstanceType<typeof OpencodeClient>, send: RpcSend) {
  if (!client) return;
  try {
    const events = await client.event.subscribe();
    for await (const event of (events as any).stream) {
      const evt = event as any;
      switch (evt.type) {
        case "message.updated": {
          const { info } = evt.properties;
          if (info.role === "assistant") {
            assistantMessageIds.add(info.id);
            if (info.time?.completed) {
              send.messageComplete({
                sessionId: info.sessionID,
                messageId: info.id,
              });
              assistantMessageIds.delete(info.id);
            }
          }
          break;
        }
        case "message.part.updated": {
          const { part, delta } = evt.properties;
          if (!part || !part.type) break;

          // Only forward parts from assistant messages
          if (!assistantMessageIds.has(part.messageID)) break;

          // Map SDK part to our MessagePart type
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
            case "step-start":
              messagePart = { id: part.id, type: "step-start", sessionID: part.sessionID, messageID: part.messageID };
              break;
            case "step-finish":
              messagePart = { id: part.id, type: "step-finish", sessionID: part.sessionID, messageID: part.messageID, tokens: part.tokens };
              break;
          }

          if (messagePart) {
            send.partUpdated({
              sessionId: part.sessionID,
              messageId: part.messageID,
              part: messagePart,
              delta: delta ?? undefined,
            });
          }
          break;
        }
        case "session.status": {
          const { sessionID, status } = evt.properties;
          send.sessionStatus({
            sessionId: sessionID,
            status: status.type,
          });
          break;
        }
        case "session.error": {
          const { sessionID, error } = evt.properties;
          const errorMsg = error?.data?.message ?? error?.name ?? "Unknown error";
          send.sessionError({
            sessionId: sessionID ?? "",
            error: errorMsg,
          });
          break;
        }
      }
    }
  } catch (err: any) {
    console.error("Event stream error:", err?.message);
  }
}
