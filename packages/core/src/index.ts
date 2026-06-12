// Temporary re-exports consumed by @pinpoint/driver-cdp (removed in the next task when
// the overlay source + globals move to their own package).
export { OVERLAY_SOURCE } from "./cdp/overlay-source.generated.js";
export { systemClipboard } from "./clipboard/write.js";
export { readPinpointConfig } from "./config/pinpoint-config.js";
export { resolveProfileDir } from "./config/profile-dir.js";
export { parseConfig } from "./config.js";
export type { Driver, DriverConnectOptions, DriverSession, HealthResult } from "./driver/driver.js";
export { FakePage } from "./driver/fake-page.js";
export type { BridgePage } from "./driver/page.js";
export * from "./overlay/globals.js";
export { startBridgeServer } from "./server/bridge-server.js";
export { SessionRegistry } from "./server/sessions.js";
export { runSetup } from "./setup/run-setup.js";
export * from "./types.js";
