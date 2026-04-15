/**
 * Web component for the chat input field.
 */
export class ChatInput extends HTMLElement {
  private input: HTMLTextAreaElement | null = null;
  private onSubmitCallback?: (message: string) => void;

  connectedCallback(): void {
    this.innerHTML = `
      <div class="krow-input" style="
        display: flex;
        align-items: flex-end;
        padding: 12px 16px;
        background: #1a1a1a;
        border-top: 1px solid #333;
      ">
        <textarea class="krow-input__textarea" placeholder="Type a message..." style="
          flex: 1;
          resize: none;
          border: 1px solid #444;
          border-radius: 8px;
          padding: 10px 14px;
          background: #2a2a2a;
          color: #e0e0e0;
          font-size: 14px;
          font-family: inherit;
          line-height: 1.4;
          max-height: 200px;
          outline: none;
        " rows="1"></textarea>
        <button class="krow-input__send" style="
          margin-left: 8px;
          padding: 10px 16px;
          background: #0066ff;
          color: white;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
        ">Send</button>
      </div>
    `;

    this.input = this.querySelector("textarea");
    const button = this.querySelector("button");

    this.input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.submit();
      }
    });

    this.input?.addEventListener("input", () => {
      if (this.input) {
        this.input.style.height = "auto";
        this.input.style.height = `${this.input.scrollHeight}px`;
      }
    });

    button?.addEventListener("click", () => this.submit());
  }

  onSubmit(callback: (message: string) => void): void {
    this.onSubmitCallback = callback;
  }

  focus(): void {
    this.input?.focus();
  }

  clear(): void {
    if (this.input) {
      this.input.value = "";
      this.input.style.height = "auto";
    }
  }

  private submit(): void {
    const value = this.input?.value.trim();
    if (value) {
      this.onSubmitCallback?.(value);
      this.clear();
    }
  }
}

if (typeof customElements !== "undefined") {
  customElements.define("krow-chat-input", ChatInput);
}
