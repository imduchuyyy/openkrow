import chalk from "chalk";
import type { Component, Style, RenderBuffer } from "../types.js";

/**
 * Input component for capturing user text input in the terminal.
 */
export class Input implements Component {
  private value = "";
  private placeholder: string;
  private style: Style;
  private cursorPos = 0;
  private focused = false;

  constructor(placeholder: string = "", style: Style = {}) {
    this.placeholder = placeholder;
    this.style = style;
  }

  getValue(): string {
    return this.value;
  }

  setValue(value: string): void {
    this.value = value;
    this.cursorPos = value.length;
  }

  setPlaceholder(placeholder: string): void {
    this.placeholder = placeholder;
  }

  setStyle(style: Style): void {
    this.style = { ...this.style, ...style };
  }

  setFocused(focused: boolean): void {
    this.focused = focused;
  }

  /**
   * Handle a keypress event.
   */
  handleKey(key: string): void {
    if (key === "backspace") {
      if (this.cursorPos > 0) {
        this.value =
          this.value.slice(0, this.cursorPos - 1) +
          this.value.slice(this.cursorPos);
        this.cursorPos--;
      }
    } else if (key === "left") {
      this.cursorPos = Math.max(0, this.cursorPos - 1);
    } else if (key === "right") {
      this.cursorPos = Math.min(this.value.length, this.cursorPos + 1);
    } else if (key.length === 1) {
      this.value =
        this.value.slice(0, this.cursorPos) +
        key +
        this.value.slice(this.cursorPos);
      this.cursorPos++;
    }
  }

  render(width: number): RenderBuffer {
    const prefix = this.focused ? "❯ " : "  ";
    const displayValue =
      this.value || chalk.dim(this.placeholder);

    let line = `${prefix}${displayValue}`;
    if (this.style.color) line = chalk.hex(this.style.color)(line);

    // Show cursor indicator when focused
    if (this.focused) {
      const cursorLine = " ".repeat(prefix.length + this.cursorPos) + "▏";
      return { lines: [line, chalk.dim(cursorLine)], width, height: 2 };
    }

    return { lines: [line], width, height: 1 };
  }
}
