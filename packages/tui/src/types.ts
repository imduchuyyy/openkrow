/**
 * Core types for the TUI library.
 */

export interface Position {
  x: number;
  y: number;
}

export interface Dimensions {
  width: number;
  height: number;
}

export interface Style {
  color?: string;
  bgColor?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  padding?: number;
  paddingX?: number;
  paddingY?: number;
  border?: "single" | "double" | "round" | "none";
  borderColor?: string;
}

export interface RenderBuffer {
  lines: string[];
  width: number;
  height: number;
}

export interface Component {
  render(width: number): RenderBuffer;
  setStyle(style: Style): void;
}
