import { describe, expect, test } from "vitest";
import {
  generateIndexJson,
  generateNodeJson,
  parseEmbedRefs,
  resolveEdgeTarget,
  resolveGraph,
  symmetriseRelated,
} from "./course-graph.js";
import type { ContentNode } from "./course-graph.js";
import courseGraph, { courseMetaSchema } from "./course-graph-integration.js";

function node(overrides: Partial<ContentNode> & { id: string; title: string }): ContentNode {
  const [type, slug] = overrides.id.split("/");
  return {
    type,
    slug,
    tags: [],
    related: [],
    links: [],
    spec: [],
    meta: {},
    body: "",
    ...overrides,
  };
}

describe("resolveEdgeTarget", () => {
  test("bare slug resolves to same collection", () => {
    expect(resolveEdgeTarget("topics", "variables")).toBe("topics/variables");
  });

  test("qualified ref passes through unchanged", () => {
    expect(resolveEdgeTarget("labs", "topics/variables")).toBe("topics/variables");
  });
});

describe("parseEmbedRefs", () => {
  test("extracts a qualified ref", () => {
    expect(parseEmbedRefs("{/* embed: topics/agent-loops */}")).toEqual(["topics/agent-loops"]);
  });

  test("strips section fragments", () => {
    expect(parseEmbedRefs("{/* embed: topics/overview#learning-outcomes */}")).toEqual([
      "topics/overview",
    ]);
  });

  test("dedupes multiple embeds of the same node", () => {
    const body = "{/* embed: topics/a#one */}\n\n---\n\n{/* embed: topics/a#two */}";
    expect(parseEmbedRefs(body)).toEqual(["topics/a"]);
  });

  test("finds multiple distinct refs in order", () => {
    const body = "{/* embed: topics/a */}\n\ntext\n\n{/* embed: crits/week-3 */}";
    expect(parseEmbedRefs(body)).toEqual(["topics/a", "crits/week-3"]);
  });

  test("tolerates flexible whitespace", () => {
    expect(parseEmbedRefs("{  /* embed:    topics/a   */ }")).toEqual(["topics/a"]);
  });

  test("ignores other directives and plain text", () => {
    const body = "{/* topic: old-syntax */}\n{/* notes: speaker notes */}\nembed: not-a-directive";
    expect(parseEmbedRefs(body)).toEqual([]);
  });

  test("returns empty array for empty body", () => {
    expect(parseEmbedRefs("")).toEqual([]);
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

describe("symmetriseRelated", () => {
  test("adds the reverse direction of a declared edge", () => {
    const nodes = [
      node({ id: "topic/a", title: "A", related: ["topic/b"] }),
      node({ id: "topic/b", title: "B" }),
    ];
    const related = symmetriseRelated(resolveGraph(nodes));
    expect(related.get("topic/a")).toEqual(["topic/b"]);
    expect(related.get("topic/b")).toEqual(["topic/a"]);
  });

  test("does not duplicate a connection declared from both sides", () => {
    const nodes = [
      node({ id: "topic/a", title: "A", related: ["topic/b"] }),
      node({ id: "topic/b", title: "B", related: ["topic/a"] }),
    ];
    const related = symmetriseRelated(resolveGraph(nodes));
    expect(related.get("topic/a")).toEqual(["topic/b"]);
    expect(related.get("topic/b")).toEqual(["topic/a"]);
  });

  test("keeps declared refs ahead of incoming ones", () => {
    const nodes = [
      node({ id: "topic/a", title: "A", related: ["topic/b"] }),
      node({ id: "topic/b", title: "B", related: ["topic/c"] }),
      node({ id: "topic/c", title: "C" }),
    ];
    const related = symmetriseRelated(resolveGraph(nodes));
    expect(related.get("topic/b")).toEqual(["topic/c", "topic/a"]);
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
    expect(b.related).toEqual(["topic/a"]);
  });

  test("omits description when absent", () => {
    const nodes = [node({ id: "topic/a", title: "A" })];
    const graph = resolveGraph(nodes);
    const json = JSON.parse(generateIndexJson(graph));
    expect(json.nodes[0]).not.toHaveProperty("description");
  });

  test("includes timezone when passed and omits it otherwise", () => {
    const graph = resolveGraph([node({ id: "topic/a", title: "A" })]);
    expect(JSON.parse(generateIndexJson(graph, "Australia/Canberra")).timezone).toBe(
      "Australia/Canberra",
    );
    expect(JSON.parse(generateIndexJson(graph))).not.toHaveProperty("timezone");
  });

  test("includes the course block when passed and omits it otherwise", () => {
    const graph = resolveGraph([node({ id: "topic/a", title: "A" })]);
    const course = {
      code: "COMP1234",
      title: "Example Course",
      session: "Semester 2, 2026",
      startDate: "2026-07-27",
      endDate: "2026-10-30",
      description: "A course about examples.",
      tags: ["examples"],
      learningOutcomes: ["explain examples"],
    };
    expect(JSON.parse(generateIndexJson(graph, undefined, course)).course).toEqual(course);
    expect(JSON.parse(generateIndexJson(graph))).not.toHaveProperty("course");
  });

  test("versions the catalogue contract and carries the canonical URL", () => {
    const graph = resolveGraph([]);
    const json = JSON.parse(
      generateIndexJson(graph, undefined, undefined, "https://courses.example/SLOP2713/"),
    );
    expect(json.schemaVersion).toBe(1);
    expect(json.canonicalUrl).toBe("https://courses.example/SLOP2713/");
    expect(JSON.parse(generateIndexJson(graph))).not.toHaveProperty("canonicalUrl");
  });

  test("includes meta when present and omits it when empty", () => {
    const nodes = [
      node({ id: "crits/week-2", title: "W2", meta: { week: 2, draft: true } }),
      node({ id: "topic/a", title: "A" }),
    ];
    const graph = resolveGraph(nodes);
    const json = JSON.parse(generateIndexJson(graph));

    const crit = json.nodes.find((n: { id: string }) => n.id === "crits/week-2");
    expect(crit.meta).toEqual({ week: 2, draft: true });

    const a = json.nodes.find((n: { id: string }) => n.id === "topic/a");
    expect(a).not.toHaveProperty("meta");
  });

  test("includes spec when present and omits it when empty", () => {
    const nodes = [
      node({ id: "crits/week-2", title: "W2", spec: ["deployed and live by the cutoff"] }),
      node({ id: "topics/a", title: "A" }),
    ];
    const json = JSON.parse(generateIndexJson(resolveGraph(nodes)));

    const crit = json.nodes.find((n: { id: string }) => n.id === "crits/week-2");
    expect(crit.spec).toEqual(["deployed and live by the cutoff"]);

    const a = json.nodes.find((n: { id: string }) => n.id === "topics/a");
    expect(a).not.toHaveProperty("spec");
  });
});

describe("generateNodeJson", () => {
  test("uses the passed related list when given", () => {
    const n = node({ id: "topics/a", title: "A", related: ["topics/b"] });
    const json = JSON.parse(generateNodeJson(n, ["topics/b", "crits/week-2"]));
    expect(json.related).toEqual(["topics/b", "crits/week-2"]);
  });

  test("includes timezone when passed and omits it otherwise", () => {
    const n = node({ id: "topics/a", title: "A" });
    expect(JSON.parse(generateNodeJson(n, n.related, "Australia/Canberra")).timezone).toBe(
      "Australia/Canberra",
    );
    expect(JSON.parse(generateNodeJson(n))).not.toHaveProperty("timezone");
  });

  test("includes all fields and body", () => {
    const n = node({
      id: "topics/variables",
      title: "Variables",
      description: "Declaring variables",
      tags: ["concept"],
      related: ["topics/functions"],
      links: [{ label: "MDN", url: "https://developer.mozilla.org" }],
      spec: [],
      meta: { references: ["https://example.com"] },
      body: "# Variables\n\nContent here.",
    });
    const json = JSON.parse(generateNodeJson(n));

    expect(json.id).toBe("topics/variables");
    expect(json.type).toBe("topics");
    expect(json.title).toBe("Variables");
    expect(json.description).toBe("Declaring variables");
    expect(json.related).toEqual(["topics/functions"]);
    expect(json.links).toEqual([{ label: "MDN", url: "https://developer.mozilla.org" }]);
    expect(json.meta.references).toEqual(["https://example.com"]);
    expect(json).not.toHaveProperty("spec");
    expect(json.body).toContain("# Variables");
  });

  test("includes spec when the node declares one", () => {
    const n = node({
      id: "crits/week-2",
      title: "W2",
      spec: ["deployed and live by the cutoff", "recognisably a blog"],
    });
    const json = JSON.parse(generateNodeJson(n));
    expect(json.spec).toEqual(["deployed and live by the cutoff", "recognisably a blog"]);
  });
});

describe("courseMetaSchema", () => {
  const valid = {
    code: "COMP1234",
    title: "Example Course",
    session: "Semester 2, 2026",
    startDate: "2026-07-27",
    endDate: "2026-10-30",
    description: "A course about examples.",
  };

  test("parses valid metadata and defaults learningOutcomes to empty", () => {
    const parsed = courseMetaSchema.parse(valid);
    expect(parsed).toMatchObject(valid);
    expect(parsed.tags).toEqual([]);
    expect(parsed.learningOutcomes).toEqual([]);
  });

  test("carries optional catalogue metadata", () => {
    const parsed = courseMetaSchema.parse({
      ...valid,
      session: "Semester 2",
      year: 2026,
      level: 4,
      tags: ["design", "computing"],
    });
    expect(parsed).toMatchObject({
      session: "Semester 2",
      year: 2026,
      level: 4,
      tags: ["design", "computing"],
    });
  });

  test("rejects missing required fields", () => {
    const { code: _code, ...rest } = valid;
    expect(courseMetaSchema.safeParse(rest).success).toBe(false);
  });

  test("rejects unknown fields (strict)", () => {
    expect(courseMetaSchema.safeParse({ ...valid, startdate: "2026-07-27" }).success).toBe(false);
  });

  test("rejects non-ISO dates and reversed date ranges", () => {
    expect(courseMetaSchema.safeParse({ ...valid, startDate: "27 July 2026" }).success).toBe(false);
    expect(courseMetaSchema.safeParse({ ...valid, startDate: "2026-11-01" }).success).toBe(false);
  });

  test("courseGraph() fails fast on invalid course metadata", () => {
    expect(() =>
      courseGraph({ collections: [{ key: "topics" }], course: { code: "X" } as never }),
    ).toThrow(/invalid course metadata/);
    expect(() => courseGraph({ collections: [{ key: "topics" }], course: valid })).not.toThrow();
  });

  test("courseGraph() fails fast on an invalid canonical URL", () => {
    expect(() =>
      courseGraph({ collections: [{ key: "topics" }], canonicalUrl: "not a URL" }),
    ).toThrow(/invalid canonicalUrl/);
    expect(() =>
      courseGraph({
        collections: [{ key: "topics" }],
        canonicalUrl: "https://courses.example/CODE1234/",
      }),
    ).not.toThrow();
  });
});
