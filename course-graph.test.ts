import { describe, expect, test } from "vitest";
import {
  resolveEdgeTarget,
  resolveGraph,
  generateIndexJson,
  generateNodeJson,
} from "./course-graph.js";
import type { ContentNode } from "./course-graph.js";

function node(overrides: Partial<ContentNode> & { id: string; title: string }): ContentNode {
  const [type, slug] = overrides.id.split("/");
  return {
    type,
    slug,
    tags: [],
    related: [],
    meta: {},
    body: "",
    ...overrides,
  };
}

describe("resolveEdgeTarget", () => {
  test("bare slug resolves to same type", () => {
    expect(resolveEdgeTarget("topic", "variables")).toBe("topic/variables");
  });

  test("typed ref passes through unchanged", () => {
    expect(resolveEdgeTarget("lab", "topic/variables")).toBe("topic/variables");
  });
});

describe("resolveGraph", () => {
  test("returns nodes and empty edges for isolated nodes", () => {
    const nodes = [node({ id: "topic/a", title: "A" }), node({ id: "topic/b", title: "B" })];
    const graph = resolveGraph(nodes);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(0);
    expect(graph.errors).toHaveLength(0);
  });

  test("builds related edges", () => {
    const nodes = [
      node({ id: "topic/a", title: "A", related: ["topic/b"] }),
      node({ id: "topic/b", title: "B" }),
    ];
    const graph = resolveGraph(nodes);
    expect(graph.edges).toEqual([{ from: "topic/a", to: "topic/b" }]);
    expect(graph.errors).toHaveLength(0);
  });

  test("reports dangling related reference", () => {
    const nodes = [node({ id: "topic/a", title: "A", related: ["topic/gone"] })];
    const graph = resolveGraph(nodes);
    expect(graph.errors).toHaveLength(1);
    expect(graph.errors[0]).toMatchObject({
      type: "dangling-ref",
      node: "topic/a",
      ref: "topic/gone",
    });
    expect(graph.edges).toHaveLength(0);
  });

  test("reports self-referencing related", () => {
    const nodes = [node({ id: "topic/a", title: "A", related: ["topic/a"] })];
    const graph = resolveGraph(nodes);
    expect(graph.errors).toHaveLength(1);
    expect(graph.errors[0].type).toBe("self-ref");
  });

  test("handles cross-type edges", () => {
    const nodes = [
      node({ id: "lab/setup", title: "Setup", related: ["topic/variables"] }),
      node({ id: "topic/variables", title: "Variables" }),
    ];
    const graph = resolveGraph(nodes);
    expect(graph.edges).toEqual([{ from: "lab/setup", to: "topic/variables" }]);
    expect(graph.errors).toHaveLength(0);
  });

  test("bidirectional related links both produce edges", () => {
    const nodes = [
      node({ id: "topic/a", title: "A", related: ["topic/b"] }),
      node({ id: "topic/b", title: "B", related: ["topic/a"] }),
    ];
    const graph = resolveGraph(nodes);
    expect(graph.edges).toHaveLength(2);
  });

  test("multiple related from one node", () => {
    const nodes = [
      node({ id: "topic/a", title: "A", related: ["topic/b", "topic/c"] }),
      node({ id: "topic/b", title: "B" }),
      node({ id: "topic/c", title: "C" }),
    ];
    const graph = resolveGraph(nodes);
    expect(graph.edges).toHaveLength(2);
    expect(graph.errors).toHaveLength(0);
  });

  test("empty nodes array produces empty graph", () => {
    const graph = resolveGraph([]);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
    expect(graph.errors).toHaveLength(0);
  });

  test("mix of valid and dangling references", () => {
    const nodes = [
      node({ id: "topic/a", title: "A", related: ["topic/b", "topic/gone"] }),
      node({ id: "topic/b", title: "B" }),
    ];
    const graph = resolveGraph(nodes);
    expect(graph.edges).toHaveLength(1);
    expect(graph.errors).toHaveLength(1);
    expect(graph.errors[0].type).toBe("dangling-ref");
  });
});

describe("generateIndexJson", () => {
  test("produces valid JSON with nodes and edges", () => {
    const nodes = [
      node({
        id: "topic/a",
        title: "A",
        description: "First",
        tags: ["concept"],
        related: ["topic/b"],
      }),
      node({ id: "topic/b", title: "B" }),
    ];
    const graph = resolveGraph(nodes);
    const json = JSON.parse(generateIndexJson(graph));

    expect(json.nodes).toHaveLength(2);
    expect(json.edges).toHaveLength(1);

    const a = json.nodes.find((n: { id: string }) => n.id === "topic/a");
    expect(a.title).toBe("A");
    expect(a.description).toBe("First");
    expect(a.tags).toEqual(["concept"]);
    expect(a.related).toEqual(["topic/b"]);

    const b = json.nodes.find((n: { id: string }) => n.id === "topic/b");
    expect(b).not.toHaveProperty("description");
  });

  test("omits description when absent", () => {
    const nodes = [node({ id: "topic/a", title: "A" })];
    const graph = resolveGraph(nodes);
    const json = JSON.parse(generateIndexJson(graph));
    expect(json.nodes[0]).not.toHaveProperty("description");
  });
});

describe("generateNodeJson", () => {
  test("includes all fields and body", () => {
    const n = node({
      id: "topic/variables",
      title: "Variables",
      description: "Declaring variables",
      tags: ["concept"],
      related: ["topic/functions"],
      meta: { references: ["https://example.com"] },
      body: "# Variables\n\nContent here.",
    });
    const json = JSON.parse(generateNodeJson(n));

    expect(json.id).toBe("topic/variables");
    expect(json.type).toBe("topic");
    expect(json.title).toBe("Variables");
    expect(json.description).toBe("Declaring variables");
    expect(json.related).toEqual(["topic/functions"]);
    expect(json.meta.references).toEqual(["https://example.com"]);
    expect(json.body).toContain("# Variables");
  });
});
