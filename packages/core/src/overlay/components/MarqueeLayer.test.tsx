// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, expect, it } from "vitest";
import { MarqueeLayer } from "./MarqueeLayer.js";

let container: HTMLDivElement;

afterEach(() => {
  if (container) {
    render(null, container);
    container.remove();
  }
});

it("hidden when rect is null", () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  render(<MarqueeLayer rect={null} />, container);
  const el = container.firstElementChild as HTMLElement;
  expect(el.style.display).toBe("none");
});

it("positioned + visible when rect is given", () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  render(<MarqueeLayer rect={{ x: 5, y: 15, width: 200, height: 80 }} />, container);
  const el = container.firstElementChild as HTMLElement;
  expect(el.style.display).toBe("block");
  expect(el.style.left).toBe("5px");
  expect(el.style.top).toBe("15px");
  expect(el.style.width).toBe("200px");
  expect(el.style.height).toBe("80px");
});

it("has dashed border", () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  render(<MarqueeLayer rect={null} />, container);
  const el = container.firstElementChild as HTMLElement;
  expect(el.style.cssText).toContain("dashed");
});
