import { describe, it, expect } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ThemeProvider } from "@/components/theme-provider";
import { ModeToggle } from "@/components/mode-toggle";

describe("ThemeProvider", () => {
  it("is exported as a function component", () => {
    expect(typeof ThemeProvider).toBe("function");
  });

  it("renders its children", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ThemeProvider,
        { attribute: "class", defaultTheme: "system" },
        React.createElement("span", { "data-testid": "child" }, "hello"),
      ),
    );
    expect(html).toContain("data-testid=\"child\"");
    expect(html).toContain("hello");
  });
});

describe("ModeToggle", () => {
  it("is exported as a function component", () => {
    expect(typeof ModeToggle).toBe("function");
  });
});
