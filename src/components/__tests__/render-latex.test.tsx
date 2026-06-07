// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { RenderLatex } from "@/components/render-latex";

describe("RenderLatex", () => {
  it("renders plain text without LaTeX unchanged", () => {
    const { container } = render(<RenderLatex content="Hello world" />);
    expect(container.textContent).toBe("Hello world");
    expect(container.querySelector(".katex")).toBeNull();
  });

  it("renders inline math", () => {
    const { container } = render(<RenderLatex content="The value is $x^2$." />);
    expect(container.querySelector(".katex")).not.toBeNull();
    expect(container.textContent).toContain("The value is ");
    expect(container.textContent).toContain(".");
  });

  it("renders display math", () => {
    const { container } = render(<RenderLatex content="$$E = mc^2$$" />);
    const display = container.querySelector(".katex-display");
    expect(display).not.toBeNull();
  });

  it("renders mixed text and math", () => {
    const { container } = render(
      <RenderLatex content="Given $ax^2 + bx + c = 0$, the formula is $$x = \\frac{-b}{2a}$$." />
    );
    expect(container.textContent).toContain("Given ");
    expect(container.textContent).toContain(", the formula is ");
    const katexElements = container.querySelectorAll(".katex");
    expect(katexElements.length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector(".katex-display")).not.toBeNull();
  });

  it("handles KaTeX parse errors gracefully", () => {
    const { container } = render(<RenderLatex content="$\\invalidcmd$" />);
    expect(container).not.toBeNull();
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("handles text with no delimiters", () => {
    const { container } = render(<RenderLatex content="Plain text only" />);
    expect(container.textContent).toBe("Plain text only");
    expect(container.querySelector(".katex")).toBeNull();
  });

  it("handles empty string", () => {
    const { container } = render(<RenderLatex content="" />);
    expect(container.textContent).toBe("");
  });

  it("handles escaped dollar sign", () => {
    const { container } = render(<RenderLatex content="Price is \\$5." />);
    expect(container.textContent).toContain("Price is");
    expect(container.textContent).toContain("5.");
    expect(container.querySelector(".katex")).toBeNull();
  });

  it("handles multi-line display math", () => {
    const { container } = render(<RenderLatex content={"$$\nx^2\n$$"} />);
    expect(container.querySelector(".katex-display")).not.toBeNull();
  });

  it("does not match single dollar inside display math", () => {
    const { container } = render(<RenderLatex content="$$x$y$$" />);
    // The entire $$x$y$$ should be treated as one display math block
    // (even if KaTeX cannot parse the inner content, it should not be split
    // into two inline math expressions).
    const errorOrDisplay = container.querySelector(".katex-display, .katex-error");
    expect(errorOrDisplay).not.toBeNull();
    // The raw $$ delimiters should not appear as visible text
    expect(container.textContent).not.toContain("$$");
  });

  it("applies className when provided", () => {
    const { container } = render(
      <RenderLatex content="hello" className="text-red-500" />
    );
    const span = container.querySelector("span.text-red-500");
    expect(span).not.toBeNull();
  });

  it("preserves whitespace between segments", () => {
    const { container } = render(
      <RenderLatex content="before $x$ middle $y$ after" />
    );
    expect(container.textContent).toContain("before ");
    expect(container.textContent).toContain(" middle ");
    expect(container.textContent).toContain(" after");
  });
});
