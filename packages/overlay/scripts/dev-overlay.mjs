// Dev hot loop launcher: run the esbuild overlay watch and the bridge (PIN_DEV) together.
// The bridge reads PIN_APP_URL (your running dev app) like a normal `pinpoint` start.
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const procs = [];

function run(cmd, args, extraEnv = {}) {
  const child = spawn(cmd, args, {
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
  });
  procs.push(child);
  child.on("exit", (code) => {
    for (const p of procs) if (p !== child) p.kill();
    process.exit(code ?? 0);
  });
  return child;
}

// 1. esbuild watch -> packages/overlay/dist/overlay.iife.js
run("node", [join(here, "build-overlay.mjs"), "--watch"]);
// 2. the bridge in dev mode (re-injects on each rebuild). bin path resolves from this package.
const bin = join(here, "../../claude-code/bin/pinpoint");
run("node", [bin], { PIN_DEV: "1" });

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    for (const p of procs) p.kill();
    process.exit(0);
  });
}
