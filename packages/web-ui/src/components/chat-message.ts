import type { ChatMessageData } from "../types.js";

/**
 * Web component for rendering a single chat message.
 * Uses Custom Elements API for framework-agnostic usage.
 */
export class ChatMessage extends HTMLElement {
  private data: ChatMessageData | null = null;

  static get observedAttributes(): string[] {
    return ["role"];
  }

  connectedCallback(): void {
    this.render();
  }

  setMessage(data: ChatMessageData): void {
    this.data = data;
    this.render();
  }

  private render(): void {
    if (!this.data) return;

    const isUser = this.data.role === "user";
    this.innerHTML = `
      <div class="krow-message krow-message--${this.data.role}" style="
        display: flex;
        flex-direction: column;
        align-items: ${isUser ? "flex-end" : "flex-start"};
        margin: 8px 0;
        padding: 0 16px;
      ">
        <div class="krow-message__label" style="
          font-size: 12px;
          color: #888;
          margin-bottom: 4px;
        ">${isUser ? "You" : "Assistant"}</div>
        <div class="krow-message__bubble" style="
          background: ${isUser ? "#0066ff" : "#2a2a2a"};
          color: ${isUser ? "#fff" : "#e0e0e0"};
          padding: 12px 16px;
          border-radius: 12px;
          max-width: 80%;
          white-space: pre-wrap;
          word-break: break-word;
          line-height: 1.5;
        ">${this.escapeHtml(this.data.content)}${
      this.data.isStreaming ? '<span class="krow-cursor">▊</span>' : ""
    }</div>
        ${this.renderToolCalls()}
      </div>
    `;
  }

  private renderToolCalls(): string {
    if (!this.data?.toolCalls?.length) return "";

    return this.data.toolCalls
      .map(
        (tc) => `
      <div class="krow-tool-call" style="
        margin-top: 4px;
        padding: 8px 12px;
        background: #1a1a2e;
        border-radius: 8px;
        font-size: 13px;
        font-family: monospace;
        color: #a0a0a0;
      ">
        <span style="color: #ffcc00;">⚡</span> ${this.escapeHtml(tc.name)}
        <span style="color: ${
          tc.status === "completed"
            ? "#00cc66"
            : tc.status === "error"
              ? "#ff4444"
              : "#ffcc00"
        };">[${tc.status}]</span>
      </div>
    `
      )
      .join("");
  }

  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

if (typeof customElements !== "undefined") {
  customElements.define("krow-chat-message", ChatMessage);
}
