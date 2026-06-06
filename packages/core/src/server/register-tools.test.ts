import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { FakePage } from "../cdp/fake-page.js";
import type { RawSelection } from "../cdp/selection-probe.js";
import { SELECTION_PROBE } from "../cdp/selection-probe.js";
import { registerTools } from "./register-tools.js";

const SAMPLE_SELECTION: RawSelection = {
  selector: "h1",
  tagName: "H1",
  text: "Hello",
  rect: { x: 0, y: 0, width: 100, height: 30 },
  componentName: "PageTitle",
  ancestry: ["PageTitle"],
};

async function buildClientServer(page: FakePage) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerTools(server, { page });

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);
  return { client, server };
}

describe("registerTools", () => {
  it("lists exactly get_selection and screenshot tools", async () => {
    const page = new FakePage();
    const { client } = await buildClientServer(page);

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["get_selection", "screenshot"]);
  });

  it("get_selection returns status:selected with componentName for a populated selection", async () => {
    const page = new FakePage({ evalResults: { [SELECTION_PROBE]: SAMPLE_SELECTION } });
    const { client } = await buildClientServer(page);

    const result = await client.callTool({ name: "get_selection", arguments: {} });
    expect(result.isError).toBeFalsy();
    const textContent = result.content.find((c: { type: string }) => c.type === "text") as
      | { type: "text"; text: string }
      | undefined;
    expect(textContent).toBeDefined();
    const parsed = JSON.parse(textContent!.text);
    expect(parsed.status).toBe("selected");
    expect(parsed.componentName).toBe("PageTitle");
  });
});
