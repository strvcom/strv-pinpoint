import { describe, expect, it, vi } from "vitest";
import { clipboardCommand, writeWith } from "./write.js";

describe("clipboardCommand", () => {
  it("uses pbcopy on macOS", () => {
    expect(clipboardCommand("darwin")).toEqual({ cmd: "pbcopy", args: [] });
  });
  it("uses clip on Windows", () => {
    expect(clipboardCommand("win32").cmd).toBe("clip");
  });
  it("uses an X11 tool on Linux", () => {
    expect(["xclip", "xsel"]).toContain(clipboardCommand("linux").cmd);
  });
});

describe("writeWith", () => {
  it("spawns the platform command and writes text to stdin", async () => {
    const writes: string[] = [];
    let ended = false;
    const fakeSpawn = vi.fn(() => ({
      stdin: {
        write: (s: string) => writes.push(s),
        end: () => {
          ended = true;
        },
      },
      on: (ev: string, cb: (code: number) => void) => {
        if (ev === "close") cb(0);
      },
    }));
    await writeWith("hello", "darwin", fakeSpawn as never);
    expect(fakeSpawn).toHaveBeenCalledWith("pbcopy", []);
    expect(writes.join("")).toBe("hello");
    expect(ended).toBe(true);
  });

  it("rejects on a non-zero exit", async () => {
    const fakeSpawn = vi.fn(() => ({
      stdin: { write: () => {}, end: () => {} },
      on: (ev: string, cb: (code: number) => void) => {
        if (ev === "close") cb(1);
      },
    }));
    await expect(writeWith("x", "linux", fakeSpawn as never)).rejects.toThrow();
  });
});
