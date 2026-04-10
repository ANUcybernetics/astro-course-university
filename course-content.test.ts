import { describe, expect } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readCourseNodes, writeCourseApi } from "./course-content.js";
import { resolveGraph } from "./course-graph.js";
import { fsTest } from "./test-utils.js";

interface MockNode {
  collection: string;
  slug: string;
  frontmatter: string;
  body?: string;
}

async function writeMockCourse(tmpDir: string, nodes: MockNode[]): Promise<void> {
  for (const n of nodes) {
    const dir = join(tmpDir, n.collection);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${n.slug}.md`), `---\n${n.frontmatter}\n---\n\n${n.body ?? ""}\n`);
  }
}

describe("readCourseNodes", () => {
  fsTest("reads a single topic", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      {
        collection: "topics",
        slug: "variables",
        frontmatter: "title: Variables\nsummary: Declaring variables",
      },
    ]);
    const nodes = await readCourseNodes(tmpDir);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      id: "topic/variables",
      type: "topic",
      slug: "variables",
      title: "Variables",
      description: "Declaring variables",
    });
  });

  fsTest("reads multiple collection types", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      { collection: "topics", slug: "functions", frontmatter: "title: Functions" },
      { collection: "labs", slug: "01-intro", frontmatter: "title: Intro Lab\nweek: 1" },
      {
        collection: "assessments",
        slug: "01-assignment",
        frontmatter: "title: Assignment 1\nweight: 25\nweek: 3",
      },
      { collection: "admin", slug: "overview", frontmatter: "title: Course Overview" },
    ]);
    const nodes = await readCourseNodes(tmpDir);
    expect(nodes).toHaveLength(4);

    const types = nodes.map((n) => n.type).sort();
    expect(types).toEqual(["admin", "assessment", "lab", "topic"]);
  });

  fsTest("preserves type-specific fields in meta", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      {
        collection: "assessments",
        slug: "a1",
        frontmatter: "title: A1\nweight: 25\nweek: 3\ndue: 2025-03-28",
      },
    ]);
    const nodes = await readCourseNodes(tmpDir);
    expect(nodes[0].meta).toMatchObject({ weight: 25, week: 3 });
  });

  fsTest("parses related edges with bare slugs", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      {
        collection: "topics",
        slug: "debugging",
        frontmatter: "title: Debugging\nrelated:\n  - testing",
      },
      { collection: "topics", slug: "testing", frontmatter: "title: Testing" },
    ]);
    const nodes = await readCourseNodes(tmpDir);
    const dbg = nodes.find((n) => n.slug === "debugging")!;
    expect(dbg.related).toEqual(["topic/testing"]);
  });

  fsTest("parses cross-type related edges", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      {
        collection: "labs",
        slug: "lab1",
        frontmatter: "title: Lab 1\nweek: 1\nrelated:\n  - topic/variables",
      },
      { collection: "topics", slug: "variables", frontmatter: "title: Variables" },
    ]);
    const nodes = await readCourseNodes(tmpDir);
    const lab = nodes.find((n) => n.type === "lab")!;
    expect(lab.related).toEqual(["topic/variables"]);
  });

  fsTest("handles single-string related (not array)", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      { collection: "topics", slug: "a", frontmatter: "title: A\nrelated: b" },
      { collection: "topics", slug: "b", frontmatter: "title: B" },
    ]);
    const nodes = await readCourseNodes(tmpDir);
    const a = nodes.find((n) => n.slug === "a")!;
    expect(a.related).toEqual(["topic/b"]);
  });

  fsTest("parses tags", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      {
        collection: "topics",
        slug: "git",
        frontmatter: "title: Git\ntags:\n  - practice\n  - tools",
      },
    ]);
    const nodes = await readCourseNodes(tmpDir);
    expect(nodes[0].tags).toEqual(["practice", "tools"]);
  });

  fsTest("filters out unpublished entries", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      { collection: "topics", slug: "draft", frontmatter: "title: Draft\npublished: false" },
      { collection: "topics", slug: "live", frontmatter: "title: Live" },
    ]);
    const nodes = await readCourseNodes(tmpDir);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].title).toBe("Live");
  });

  fsTest("skips files without title", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      { collection: "topics", slug: "notitle", frontmatter: "summary: No title here" },
    ]);
    const nodes = await readCourseNodes(tmpDir);
    expect(nodes).toHaveLength(0);
  });

  fsTest("skips files without frontmatter", async ({ tmpDir }) => {
    const dir = join(tmpDir, "topics");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "bare.md"), "# Just content\n\nNo frontmatter.\n");
    const nodes = await readCourseNodes(tmpDir);
    expect(nodes).toHaveLength(0);
  });

  fsTest("skips files outside known collection directories", async ({ tmpDir }) => {
    await mkdir(join(tmpDir, "unknown"), { recursive: true });
    await writeFile(join(tmpDir, "unknown", "page.md"), "---\ntitle: Page\n---\n\nContent.\n");
    await writeFile(join(tmpDir, "root.md"), "---\ntitle: Root\n---\n\nContent.\n");
    const nodes = await readCourseNodes(tmpDir);
    expect(nodes).toHaveLength(0);
  });

  fsTest("prefers description over summary", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      {
        collection: "topics",
        slug: "both",
        frontmatter: "title: Both\ndescription: The description\nsummary: The summary",
      },
    ]);
    const nodes = await readCourseNodes(tmpDir);
    expect(nodes[0].description).toBe("The description");
  });

  fsTest("falls back to summary when no description", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      { collection: "topics", slug: "sum", frontmatter: "title: Sum\nsummary: A summary" },
    ]);
    const nodes = await readCourseNodes(tmpDir);
    expect(nodes[0].description).toBe("A summary");
  });

  fsTest(
    "description is undefined when neither description nor summary set",
    async ({ tmpDir }) => {
      await writeMockCourse(tmpDir, [
        { collection: "topics", slug: "bare", frontmatter: "title: Bare" },
      ]);
      const nodes = await readCourseNodes(tmpDir);
      expect(nodes[0].description).toBeUndefined();
    },
  );

  fsTest("preserves markdown body", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      {
        collection: "topics",
        slug: "content",
        frontmatter: "title: Content",
        body: "# Heading\n\nParagraph.",
      },
    ]);
    const nodes = await readCourseNodes(tmpDir);
    expect(nodes[0].body).toContain("# Heading");
    expect(nodes[0].body).toContain("Paragraph.");
  });

  fsTest("returns empty array for empty directory", async ({ tmpDir }) => {
    const nodes = await readCourseNodes(tmpDir);
    expect(nodes).toEqual([]);
  });

  fsTest("handles mdx files", async ({ tmpDir }) => {
    const dir = join(tmpDir, "topics");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "component.mdx"),
      '---\ntitle: Component\n---\n\nimport Card from "./Card.astro";\n\n# Hello\n',
    );
    const nodes = await readCourseNodes(tmpDir);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe("topic/component");
  });
});

describe("end-to-end: read content then resolve graph", () => {
  fsTest("detects dangling related reference in mock course", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      {
        collection: "topics",
        slug: "functions",
        frontmatter: "title: Functions\nrelated:\n  - nonexistent",
      },
    ]);
    const nodes = await readCourseNodes(tmpDir);
    const graph = resolveGraph(nodes);
    expect(graph.errors).toHaveLength(1);
    expect(graph.errors[0]).toMatchObject({
      type: "dangling-ref",
      ref: "topic/nonexistent",
    });
  });

  fsTest("resolves valid related links", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      { collection: "topics", slug: "loops", frontmatter: "title: Loops\nrelated:\n  - variables" },
      { collection: "topics", slug: "variables", frontmatter: "title: Variables" },
    ]);
    const nodes = await readCourseNodes(tmpDir);
    const graph = resolveGraph(nodes);
    expect(graph.errors).toHaveLength(0);
    expect(graph.edges).toEqual([{ from: "topic/loops", to: "topic/variables" }]);
  });

  fsTest("full mock course with mixed types and edges", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      {
        collection: "topics",
        slug: "variables",
        frontmatter: "title: Variables\ntags:\n  - concept",
      },
      {
        collection: "topics",
        slug: "functions",
        frontmatter: "title: Functions\ntags:\n  - concept\nrelated:\n  - variables\n  - debugging",
      },
      {
        collection: "topics",
        slug: "debugging",
        frontmatter: "title: Debugging\ntags:\n  - practice",
      },
      {
        collection: "labs",
        slug: "01-intro",
        frontmatter: "title: Intro Lab\nweek: 1\nrelated:\n  - topic/variables",
      },
      {
        collection: "assessments",
        slug: "01-a1",
        frontmatter: "title: Assignment 1\nweek: 4\nweight: 25\nrelated:\n  - topic/functions",
      },
      { collection: "admin", slug: "overview", frontmatter: "title: Course Overview" },
    ]);
    const nodes = await readCourseNodes(tmpDir);
    const graph = resolveGraph(nodes);

    expect(graph.errors).toHaveLength(0);
    expect(graph.nodes).toHaveLength(6);
    expect(graph.edges).toHaveLength(4);
  });
});

describe("writeCourseApi", () => {
  fsTest("writes index.json and per-node JSON files", async ({ tmpDir }) => {
    const contentDir = join(tmpDir, "content");
    const distDir = join(tmpDir, "dist");
    await mkdir(distDir, { recursive: true });

    await writeMockCourse(contentDir, [
      {
        collection: "topics",
        slug: "variables",
        frontmatter: "title: Variables\ntags:\n  - concept",
        body: "Vars content.",
      },
      {
        collection: "topics",
        slug: "functions",
        frontmatter: "title: Functions\nrelated:\n  - variables",
        body: "Funcs content.",
      },
      {
        collection: "labs",
        slug: "01-intro",
        frontmatter: "title: Intro Lab\nweek: 1",
        body: "Lab content.",
      },
    ]);

    const { graph, filesWritten } = await writeCourseApi(contentDir, distDir);
    expect(graph.errors).toHaveLength(0);
    expect(filesWritten).toBe(4);

    expect(existsSync(join(distDir, "api", "index.json"))).toBe(true);
    expect(existsSync(join(distDir, "api", "topic", "variables.json"))).toBe(true);
    expect(existsSync(join(distDir, "api", "topic", "functions.json"))).toBe(true);
    expect(existsSync(join(distDir, "api", "lab", "01-intro.json"))).toBe(true);
  });

  fsTest("index.json contains all nodes and edges", async ({ tmpDir }) => {
    const contentDir = join(tmpDir, "content");
    const distDir = join(tmpDir, "dist");
    await mkdir(distDir, { recursive: true });

    await writeMockCourse(contentDir, [
      { collection: "topics", slug: "a", frontmatter: "title: A" },
      { collection: "topics", slug: "b", frontmatter: "title: B\nrelated:\n  - a" },
    ]);

    await writeCourseApi(contentDir, distDir);
    const index = JSON.parse(await readFile(join(distDir, "api", "index.json"), "utf-8"));

    expect(index.nodes).toHaveLength(2);
    expect(index.edges).toHaveLength(1);

    const nodeB = index.nodes.find((n: { id: string }) => n.id === "topic/b");
    expect(nodeB.related).toEqual(["topic/a"]);
  });

  fsTest("per-node JSON includes body", async ({ tmpDir }) => {
    const contentDir = join(tmpDir, "content");
    const distDir = join(tmpDir, "dist");
    await mkdir(distDir, { recursive: true });

    await writeMockCourse(contentDir, [
      {
        collection: "topics",
        slug: "base",
        frontmatter: "title: Base",
        body: "Base content here.",
      },
    ]);

    await writeCourseApi(contentDir, distDir);
    const baseJson = JSON.parse(
      await readFile(join(distDir, "api", "topic", "base.json"), "utf-8"),
    );

    expect(baseJson.title).toBe("Base");
    expect(baseJson.body).toContain("Base content here.");
  });

  fsTest("writes valid index.json for empty course", async ({ tmpDir }) => {
    const contentDir = join(tmpDir, "content");
    const distDir = join(tmpDir, "dist");
    await mkdir(contentDir, { recursive: true });
    await mkdir(distDir, { recursive: true });

    const { graph, filesWritten } = await writeCourseApi(contentDir, distDir);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
    expect(filesWritten).toBe(1);

    const index = JSON.parse(await readFile(join(distDir, "api", "index.json"), "utf-8"));
    expect(index.nodes).toEqual([]);
    expect(index.edges).toEqual([]);
  });

  fsTest("returns errors for invalid graph", async ({ tmpDir }) => {
    const contentDir = join(tmpDir, "content");
    const distDir = join(tmpDir, "dist");
    await mkdir(distDir, { recursive: true });

    await writeMockCourse(contentDir, [
      {
        collection: "topics",
        slug: "broken",
        frontmatter: "title: Broken\nrelated:\n  - nonexistent",
      },
    ]);

    const { graph } = await writeCourseApi(contentDir, distDir);
    expect(graph.errors).toHaveLength(1);
    expect(graph.errors[0].type).toBe("dangling-ref");
  });

  fsTest("handles procedures collection", async ({ tmpDir }) => {
    const contentDir = join(tmpDir, "content");
    const distDir = join(tmpDir, "dist");
    await mkdir(distDir, { recursive: true });

    await writeMockCourse(contentDir, [
      { collection: "topics", slug: "git", frontmatter: "title: Git" },
      {
        collection: "procedures",
        slug: "submit",
        frontmatter: "title: Submitting\nrelated:\n  - topic/git",
      },
    ]);

    const { graph } = await writeCourseApi(contentDir, distDir);
    expect(graph.errors).toHaveLength(0);
    expect(existsSync(join(distDir, "api", "procedure", "submit.json"))).toBe(true);

    const index = JSON.parse(await readFile(join(distDir, "api", "index.json"), "utf-8"));
    const proc = index.nodes.find((n: { id: string }) => n.id === "procedure/submit");
    expect(proc.related).toEqual(["topic/git"]);
  });
});
