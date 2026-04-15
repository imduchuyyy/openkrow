import chalk from "chalk";
import type { Component, Style, RenderBuffer } from "../types.js";

/**
 * Text component for styled terminal text output.
 */
export class Text implements Component {
  private content: string;
  private style: Style;

  constructor(content: string = "", style: Style = {}) {
    this.content = content;
    this.style = style;
  }

  setContent(content: string): void {
    this.content = content;
  }

  setStyle(style: Style): void {
    this.style = { ...this.style, ...style };
  }

  render(width: number): RenderBuffer {
    const lines: string[] = [];

    const applyStyle = (text: string): string => {
      let result = text;
      if (this.style.color) result = chalk.hex(this.style.color)(result);
      if (this.style.bgColor)
        result = chalk.bgHex(this.style.bgColor)(result);
      if (this.style.bold) result = chalk.bold(result);
      if (this.style.dim) result = chalk.dim(result);
      if (this.style.italic) result = chalk.italic(result);
      if (this.style.underline) result = chalk.underline(result);
      return result;
    };

    const contentLines = this.content.split("\n");
    for (const line of contentLines) {
      // Word wrap to fit width
      if (line.length <= width) {
        lines.push(applyStyle(line));
      } else {
        let remaining = line;
        while (remaining.length > 0) {
          lines.push(applyStyle(remaining.slice(0, width)));
          remaining = remaining.slice(width);
        }
      }
    }

    return { lines, width, height: lines.length };
  }
}
