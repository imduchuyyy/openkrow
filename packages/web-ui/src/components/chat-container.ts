import type { ChatMessageData } from "../types.js";
import { ChatMessage } from "./chat-message.js";
import { ChatInput } from "./chat-input.js";

/**
 * Container component that composes ChatMessage and ChatInput
 * into a full chat interface.
 */
export class ChatContainer extends HTMLElement {
  private messagesContainer: HTMLElement | null = null;
  private chatInput: ChatInput | null = null;
  private onSendCallback?: (message: string) => void;

  connectedCallback(): void {
    this.innerHTML = `
      <div class="krow-chat" style="
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #111;
        color: #e0e0e0;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      ">
        <div class="krow-chat__header" style="
          padding: 12px 16px;
          border-bottom: 1px solid #333;
          font-weight: 600;
          font-size: 16px;
        ">OpenKrow</div>
        <div class="krow-chat__messages" style="
          flex: 1;
          overflow-y: auto;
          padding: 8px 0;
        "></div>
        <krow-chat-input></krow-chat-input>
      </div>
    `;

    this.messagesContainer = this.querySelector(".krow-chat__messages");
    this.chatInput = this.querySelector("krow-chat-input") as ChatInput;

    this.chatInput?.onSubmit((message) => {
      this.onSendCallback?.(message);
    });
  }

  onSend(callback: (message: string) => void): void {
    this.onSendCallback = callback;
  }

  addMessage(data: ChatMessageData): void {
    const messageEl = document.createElement(
      "krow-chat-message"
    ) as ChatMessage;
    messageEl.setMessage(data);
    this.messagesContainer?.appendChild(messageEl);
    this.scrollToBottom();
  }

  updateMessage(id: string, data: Partial<ChatMessageData>): void {
    const messages =
      this.messagesContainer?.querySelectorAll("krow-chat-message");
    // Find and update the message with matching id
    messages?.forEach((el) => {
      const msgEl = el as ChatMessage;
      // Re-render with updated data
      msgEl.setMessage({ id, role: "assistant", content: "", timestamp: Date.now(), ...data } as ChatMessageData);
    });
  }

  clearMessages(): void {
    if (this.messagesContainer) {
      this.messagesContainer.innerHTML = "";
    }
  }

  private scrollToBottom(): void {
    if (this.messagesContainer) {
      this.messagesContainer.scrollTop =
        this.messagesContainer.scrollHeight;
    }
  }
}

if (typeof customElements !== "undefined") {
  customElements.define("krow-chat-container", ChatContainer);
}
