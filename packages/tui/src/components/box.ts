import chalk from "chalk";
import type { Component, Style, RenderBuffer } from "../types.js";

const BORDERS = {
  single: { tl: "┌", tr: "┐", bl: "└", br: "┘", h: "─", v: "│" },
  double: { tl: "╔", tr: "╗", bl: "╚", br: "╝", h: "═", v: "║" },
  round: { tl: "╭", tr: "╮", bl: "╰", br: "╯", h: "─", v: "│" },
  none: { tl: " ", tr: " ", bl: " ", br: " ", h: " ", v: " " },
};

/**
 * Box component that can contain text with borders and styling.
 */
export class Box implements Component {
  private content: string;
  private style: Style;
  private title?: string;

  constructor(content: string = "", style: Style = {}, title?: string) {
    this.content = content;
    this.style = style;
    this.title = title;
  }

  setContent(content: string): void {
    this.content = content;
  }

  setTitle(title: string): void {
    this.title = title;
  }

  setStyle(style: Style): void {
    this.style = { ...this.style, ...style };
  }

  render(width: number): RenderBuffer {
    const border = this.style.border ?? "none";
    const chars = BORDERS[border];
    const hasBorder = border !== "none";
    const padX = this.style.paddingX ?? this.style.padding ?? 0;
    const padY = this.style.paddingY ?? this.style.padding ?? 0;
    const innerWidth = width - (hasBorder ? 2 : 0) - padX * 2;
    const lines: string[] = [];

    const colorize = (text: string): string => {
      let result = text;
      if (this.style.color) result = chalk.hex(this.style.color)(result);
      if (this.style.bold) result = chalk.bold(result);
      if (this.style.dim) result = chalk.dim(result);
      return result;
    };

    const borderColor = (text: string): string => {
      if (this.style.borderColor) return chalk.hex(this.style.borderColor)(text);
      if (this.style.color) return chalk.hex(this.style.color)(text);
      return text;
    };

    // Top border
    if (hasBorder) {
      let topLine = chars.h.repeat(width - 2);
      if (this.title) {
        const titleStr = ` ${this.title} `;
        topLine =
          chars.h +
          titleStr +
          chars.h.repeat(Math.max(0, width - 4 - titleStr.length));
      }
      lines.push(borderColor(`${chars.tl}${topLine}${chars.tr}`));
    }

    // Top padding
    for (let i = 0; i < padY; i++) {
      const pad = " ".repeat(width - (hasBorder ? 2 : 0));
      lines.push(
        hasBorder
          ? borderColor(chars.v) + pad + borderColor(chars.v)
          : pad
      );
    }

    // Content lines
    const contentLines = this.content.split("\n");
    for (const line of contentLines) {
      const padding = " ".repeat(padX);
      const truncated = line.slice(0, innerWidth);
      const fill = " ".repeat(Math.max(0, innerWidth - truncated.length));
      const contentStr = colorize(`${padding}${truncated}${fill}${padding}`);

      lines.push(
        hasBorder
          ? borderColor(chars.v) + contentStr + borderColor(chars.v)
          : contentStr
      );
    }

    // Bottom padding
    for (let i = 0; i < padY; i++) {
      const pad = " ".repeat(width - (hasBorder ? 2 : 0));
      lines.push(
        hasBorder
          ? borderColor(chars.v) + pad + borderColor(chars.v)
          : pad
      );
    }

    // Bottom border
    if (hasBorder) {
      lines.push(
        borderColor(`${chars.bl}${chars.h.repeat(width - 2)}${chars.br}`)
      );
    }

    return { lines, width, height: lines.length };
  }
}
