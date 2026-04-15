import type { Component, RenderBuffer } from "./types.js";

/**
 * Screen manages the terminal output with differential rendering.
 * It only redraws lines that have changed between frames.
 */
export class Screen {
  private components: Component[] = [];
  private previousFrame: string[] = [];
  private width: number;
  private height: number;

  constructor() {
    this.width = process.stdout.columns || 80;
    this.height = process.stdout.rows || 24;

    process.stdout.on("resize", () => {
      this.width = process.stdout.columns || 80;
      this.height = process.stdout.rows || 24;
      this.fullRender();
    });
  }

  add(component: Component): void {
    this.components.push(component);
  }

  remove(component: Component): void {
    const idx = this.components.indexOf(component);
    if (idx !== -1) {
      this.components.splice(idx, 1);
    }
  }

  clear(): void {
    this.components = [];
    this.previousFrame = [];
    process.stdout.write("\x1b[2J\x1b[H");
  }

  /**
   * Render all components and only update changed lines (differential rendering).
   */
  render(): void {
    const currentFrame: string[] = [];

    for (const component of this.components) {
      const buffer = component.render(this.width);
      currentFrame.push(...buffer.lines);
    }

    // Differential rendering: only update changed lines
    for (let i = 0; i < currentFrame.length; i++) {
      if (this.previousFrame[i] !== currentFrame[i]) {
        // Move cursor to line i, clear it, write new content
        process.stdout.write(`\x1b[${i + 1};1H\x1b[2K${currentFrame[i]}`);
      }
    }

    // Clear any leftover lines from previous frame
    if (this.previousFrame.length > currentFrame.length) {
      for (let i = currentFrame.length; i < this.previousFrame.length; i++) {
        process.stdout.write(`\x1b[${i + 1};1H\x1b[2K`);
      }
    }

    this.previousFrame = currentFrame;
  }

  /**
   * Force a full re-render of all lines.
   */
  fullRender(): void {
    this.previousFrame = [];
    process.stdout.write("\x1b[2J\x1b[H");
    this.render();
  }

  getWidth(): number {
    return this.width;
  }

  getHeight(): number {
    return this.height;
  }
}
