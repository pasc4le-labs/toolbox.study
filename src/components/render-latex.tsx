"use client";

import { Fragment } from "react";
import katex from "katex";
import { cn } from "@/lib/utils";

interface RenderLatexProps {
  content: string;
  className?: string;
}

const LATEX_REGEX = /\$\$([\s\S]*?)\$\$|\$((?:[^$\\]|\\.)+?)\$/g;

type Segment =
  | { type: "text"; value: string }
  | { type: "inline"; value: string }
  | { type: "display"; value: string };

function parseSegments(content: string): Segment[] {
  if (!content) return [];
  const segments: Segment[] = [];
  let lastIndex = 0;
  LATEX_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LATEX_REGEX.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: content.slice(lastIndex, match.index) });
    }
    if (typeof match[1] === "string") {
      segments.push({ type: "display", value: match[1] });
    } else if (typeof match[2] === "string") {
      segments.push({ type: "inline", value: match[2] });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    segments.push({ type: "text", value: content.slice(lastIndex) });
  }
  return segments;
}

function renderKatex(value: string, displayMode: boolean): string {
  try {
    return katex.renderToString(value, {
      displayMode,
      throwOnError: false,
      output: "htmlAndMathml",
    });
  } catch {
    const delimiter = displayMode ? "$$" : "$";
    const escaped = value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return `${delimiter}${escaped}${delimiter}`;
  }
}

export function RenderLatex({ content, className }: RenderLatexProps) {
  if (!content) {
    return className ? <span className={className} /> : null;
  }
  const segments = parseSegments(content);
  const nodes = segments.map((segment, index) => {
    if (segment.type === "text") {
      return <Fragment key={index}>{segment.value}</Fragment>;
    }
    const html = renderKatex(segment.value, segment.type === "display");
    if (segment.type === "display") {
      return (
        <div
          key={index}
          className="my-2"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }
    return (
      <span
        key={index}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  });
  if (className) {
    return <span className={cn(className)}>{nodes}</span>;
  }
  return <>{nodes}</>;
}
