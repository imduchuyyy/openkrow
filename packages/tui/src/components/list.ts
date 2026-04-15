import chalk from "chalk";
import type { Component, Style, RenderBuffer } from "../types.js";

/**
 * List component for displaying selectable items.
 */
export class List implements Component {
  private items: string[];
  private selectedIndex = 0;
  private style: Style;
  private showIndicator: boolean;

  constructor(
    items: string[] = [],
    style: Style = {},
    showIndicator = true
  ) {
    this.items = items;
    this.style = style;
    this.showIndicator = showIndicator;
  }

  setItems(items: string[]): void {
    this.items = items;
    this.selectedIndex = Math.min(this.selectedIndex, items.length - 1);
  }

  setStyle(style: Style): void {
    this.style = { ...this.style, ...style };
  }

  getSelectedIndex(): number {
    return this.selectedIndex;
  }

  getSelectedItem(): string | undefined {
    return this.items[this.selectedIndex];
  }

  selectNext(): void {
    this.selectedIndex = Math.min(
      this.items.length - 1,
      this.selectedIndex + 1
    );
  }

  selectPrevious(): void {
    this.selectedIndex = Math.max(0, this.selectedIndex - 1);
  }

  render(width: number): RenderBuffer {
    const lines: string[] = [];

    for (let i = 0; i < this.items.length; i++) {
      const isSelected = i === this.selectedIndex;
      const indicator = this.showIndicator
        ? isSelected
          ? "❯ "
          : "  "
        : "";
      let line = `${indicator}${this.items[i]}`;

      if (isSelected) {
        line = chalk.bold(line);
        if (this.style.color) line = chalk.hex(this.style.color)(line);
      } else {
        line = chalk.dim(line);
      }

      lines.push(line.slice(0, width));
    }

    return { lines, width, height: lines.length };
  }
}
