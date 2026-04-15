import chalk from "chalk";
import type { Component, Style, RenderBuffer } from "../types.js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * Spinner component for showing loading/progress states.
 */
export class Spinner implements Component {
  private label: string;
  private style: Style;
  private frame = 0;
  private interval: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private onUpdate?: () => void;

  constructor(label: string = "Loading...", style: Style = {}) {
    this.label = label;
    this.style = style;
  }

  setLabel(label: string): void {
    this.label = label;
  }

  setStyle(style: Style): void {
    this.style = { ...this.style, ...style };
  }

  /**
   * Start the spinner animation. Pass an onUpdate callback
   * to trigger screen re-renders.
   */
  start(onUpdate?: () => void): void {
    if (this.running) return;
    this.running = true;
    this.onUpdate = onUpdate;
    this.interval = setInterval(() => {
      this.frame = (this.frame + 1) % SPINNER_FRAMES.length;
      this.onUpdate?.();
    }, 80);
  }

  stop(): void {
    this.running = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  render(_width: number): RenderBuffer {
    const spinnerChar = this.running
      ? SPINNER_FRAMES[this.frame]
      : "✓";

    let text = `${spinnerChar} ${this.label}`;
    if (this.style.color) text = chalk.hex(this.style.color)(text);
    if (this.style.bold) text = chalk.bold(text);

    return { lines: [text], width: text.length, height: 1 };
  }
}
