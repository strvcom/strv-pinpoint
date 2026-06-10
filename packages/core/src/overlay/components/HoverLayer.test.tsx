// @vitest-environment happy-dom
import { render } from "preact";
import { afterEach, expect, it } from "vitest";
import { HoverLayer } from "./HoverLayer.js";

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
  render(<HoverLayer rect={null} />, container);
  const el = container.firstElementChild as HTMLElement;
  expect(el.style.display).toBe("none");
});

it("positioned + visible when rect is given", () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  render(<HoverLayer rect={{ x: 10, y: 20, width: 100, height: 50 }} />, container);
  const el = container.firstElementChild as HTMLElement;
  expect(el.style.display).toBe("block");
  expect(el.style.left).toBe("10px");
  expect(el.style.top).toBe("20px");
  expect(el.style.width).toBe("100px");
  expect(el.style.height).toBe("50px");
});

it("has solid border", () => {
  container = document.createElement("div");
  document.body.appendChild(container);
  render(<HoverLayer rect={null} />, container);
  const el = container.firstElementChild as HTMLElement;
  expect(el.style.cssText).toContain("solid");
});
