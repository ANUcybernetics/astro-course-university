import { describe, expect } from "vitest";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readCourseNodes, writeCourseApi } from "./course-content.js";
import type { CourseCollection } from "./course-content.js";
import { resolveGraph } from "./course-graph.js";
import { fsTest } from "./test-utils.js";

interface MockNode {
  collection: string;
  slug: string;
  frontmatter: string;
  body?: string;
}

// Mock course files live under <srcDir>/content/<collection>/, matching
// the default `dir` convention (`content/<key>`).
async function writeMockCourse(srcDir: string, nodes: MockNode[]): Promise<void> {
  for (const n of nodes) {
    const dir = join(srcDir, "content", n.collection);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${n.slug}.md`), `---\n${n.frontmatter}\n---\n\n${n.body ?? ""}\n`);
  }
}

// Standard collections config used across most tests, mirroring the
// classic three-collection course shape (topics, labs, assessments).
// `key` is the whole story: collection name = node type = ref prefix.
const DEFAULT_COLLECTIONS: CourseCollection[] = [
  { key: "topics" },
  { key: "labs" },
  { key: "assessments" },
];

describe("readCourseNodes", () => {
  fsTest("reads a single topic", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      {
        collection: "topics",
        slug: "variables",
        frontmatter: "title: Variables\ndescription: Declaring variables",
      },
    ]);
    const nodes = await readCourseNodes(tmpDir, DEFAULT_COLLECTIONS);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      id: "topics/variables",
      type: "topics",
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
    ]);
    const nodes = await readCourseNodes(tmpDir, DEFAULT_COLLECTIONS);
    expect(nodes).toHaveLength(3);

    const types = nodes.map((n) => n.type).sort();
    expect(types).toEqual(["assessments", "labs", "topics"]);
  });

  fsTest("preserves type-specific fields in meta", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      {
        collection: "assessments",
        slug: "a1",
        frontmatter: "title: A1\nweight: 25\nweek: 3\ndue: 2025-03-28",
      },
    ]);
    const nodes = await readCourseNodes(tmpDir, DEFAULT_COLLECTIONS);
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
    const nodes = await readCourseNodes(tmpDir, DEFAULT_COLLECTIONS);
    const dbg = nodes.find((n) => n.slug === "debugging")!;
    expect(dbg.related).toEqual(["topics/testing"]);
  });

  fsTest("parses cross-collection related edges", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      {
        collection: "labs",
        slug: "lab1",
        frontmatter: "title: Lab 1\nweek: 1\nrelated:\n  - topics/variables",
      },
      { collection: "topics", slug: "variables", frontmatter: "title: Variables" },
    ]);
    const nodes = await readCourseNodes(tmpDir, DEFAULT_COLLECTIONS);
    const lab = nodes.find((n) => n.type === "labs")!;
    expect(lab.related).toEqual(["topics/variables"]);
  });

  fsTest("handles single-string related (not array)", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      { collection: "topics", slug: "a", frontmatter: "title: A\nrelated: b" },
      { collection: "topics", slug: "b", frontmatter: "title: B" },
    ]);
    const nodes = await readCourseNodes(tmpDir, DEFAULT_COLLECTIONS);
    const a = nodes.find((n) => n.slug === "a")!;
    expect(a.related).toEqual(["topics/b"]);
  });

  fsTest("derives related edges from embed directives", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      {
        collection: "labs",
        slug: "lab1",
        frontmatter: "title: Lab 1\nweek: 1",
        body: "# Intro\n\n{/* embed: topics/variables#setup */}\n\n---\n\n{/* embed: topics/functions */}",
      },
      { collection: "topics", slug: "variables", frontmatter: "title: Variables" },
      { collection: "topics", slug: "functions", frontmatter: "title: Functions" },
    ]);
    const nodes = await readCourseNodes(tmpDir, DEFAULT_COLLECTIONS);
    const lab = nodes.find((n) => n.type === "labs")!;
    expect(lab.related).toEqual(["topics/variables", "topics/functions"]);
  });

  fsTest("dedupes embed-derived refs against declared related", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      {
        collection: "labs",
        slug: "lab1",
        frontmatter: "title: Lab 1\nweek: 1\nrelated:\n  - topics/variables",
        body: "{/* embed: topics/variables */}\n\n{/* embed: topics/variables#again */}",
      },
      { collection: "topics", slug: "variables", frontmatter: "title: Variables" },
    ]);
    const nodes = await readCourseNodes(tmpDir, DEFAULT_COLLECTIONS);
    const lab = nodes.find((n) => n.type === "labs")!;
    expect(lab.related).toEqual(["topics/variables"]);
  });

  fsTest("parses external links", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      {
        collection: "topics",
        slug: "feedback",
        frontmatter:
          "title: Feedback\nlinks:\n  - label: Ladder of Feedback\n    url: https://pz.harvard.edu/resources/ladder-of-feedback",
      },
    ]);
    const nodes = await readCourseNodes(tmpDir, DEFAULT_COLLECTIONS);
    expect(nodes[0].links).toEqual([
      { label: "Ladder of Feedback", url: "https://pz.harvard.edu/resources/ladder-of-feedback" },
    ]);
    expect(nodes[0].meta).not.toHaveProperty("links");
  });

  fsTest("links default to empty array and never become edges", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      { collection: "topics", slug: "bare", frontmatter: "title: Bare" },
    ]);
    const nodes = await readCourseNodes(tmpDir, DEFAULT_COLLECTIONS);
    expect(nodes[0].links).toEqual([]);
    const graph = resolveGraph(nodes);
    expect(graph.edges).toHaveLength(0);
  });

  fsTest("parses tags", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      {
        collection: "topics",
        slug: "git",
        frontmatter: "title: Git\ntags:\n  - practice\n  - tools",
      },
    ]);
    const nodes = await readCourseNodes(tmpDir, DEFAULT_COLLECTIONS);
    expect(nodes[0].tags).toEqual(["practice", "tools"]);
  });

  fsTest("filters out unpublished entries", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      { collection: "topics", slug: "draft", frontmatter: "title: Draft\npublished: false" },
      { collection: "topics", slug: "live", frontmatter: "title: Live" },
    ]);
    const nodes = await readCourseNodes(tmpDir, DEFAULT_COLLECTIONS);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].title).toBe("Live");
  });

  fsTest("skips files without title", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      { collection: "topics", slug: "notitle", frontmatter: "summary: No title here" },
    ]);
    const nodes = await readCourseNodes(tmpDir, DEFAULT_COLLECTIONS);
    expect(nodes).toHaveLength(0);
  });

  fsTest("skips files without frontmatter", async ({ tmpDir }) => {
    const dir = join(tmpDir, "content", "topics");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "bare.md"), "# Just content\n\nNo frontmatter.\n");
    const nodes = await readCourseNodes(tmpDir, DEFAULT_COLLECTIONS);
    expect(nodes).toHaveLength(0);
  });

  fsTest("skips files outside configured collection directories", async ({ tmpDir }) => {
    await mkdir(join(tmpDir, "content", "unknown"), { recursive: true });
    await writeFile(
      join(tmpDir, "content", "unknown", "page.md"),
      "---\ntitle: Page\n---\n\nContent.\n",
    );
    await writeFile(join(tmpDir, "content", "root.md"), "---\ntitle: Root\n---\n\nContent.\n");
    const nodes = await readCourseNodes(tmpDir, DEFAULT_COLLECTIONS);
    expect(nodes).toHaveLength(0);
  });

  fsTest("reads description", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      {
        collection: "topics",
        slug: "desc",
        frontmatter: "title: Desc\ndescription: The description",
      },
    ]);
    const nodes = await readCourseNodes(tmpDir, DEFAULT_COLLECTIONS);
    expect(nodes[0].description).toBe("The description");
  });

  fsTest("does not fall back to legacy summary frontmatter", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      { collection: "topics", slug: "sum", frontmatter: "title: Sum\nsummary: A summary" },
    ]);
    const nodes = await readCourseNodes(tmpDir, DEFAULT_COLLECTIONS);
    expect(nodes[0].description).toBeUndefined();
  });

  fsTest(
    "description is undefined when neither description nor summary set",
    async ({ tmpDir }) => {
      await writeMockCourse(tmpDir, [
        { collection: "topics", slug: "bare", frontmatter: "title: Bare" },
      ]);
      const nodes = await readCourseNodes(tmpDir, DEFAULT_COLLECTIONS);
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
    const nodes = await readCourseNodes(tmpDir, DEFAULT_COLLECTIONS);
    expect(nodes[0].body).toContain("# Heading");
    expect(nodes[0].body).toContain("Paragraph.");
  });

  fsTest("returns empty array for empty directory", async ({ tmpDir }) => {
    const nodes = await readCourseNodes(tmpDir, DEFAULT_COLLECTIONS);
    expect(nodes).toEqual([]);
  });

  fsTest("handles mdx files", async ({ tmpDir }) => {
    const dir = join(tmpDir, "content", "topics");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "component.mdx"),
      '---\ntitle: Component\n---\n\nimport Card from "./Card.astro";\n\n# Hello\n',
    );
    const nodes = await readCourseNodes(tmpDir, DEFAULT_COLLECTIONS);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe("topics/component");
  });

  fsTest("custom dir decouples the on-disk directory from the key", async ({ tmpDir }) => {
    const dir = join(tmpDir, "content", "crit-sessions");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "01-prototype.md"), "---\ntitle: Prototype 1\nweek: 4\n---\n");
    const nodes = await readCourseNodes(tmpDir, [{ key: "crits", dir: "content/crit-sessions" }]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      id: "crits/01-prototype",
      type: "crits",
      slug: "01-prototype",
    });
  });

  fsTest("suffix collections match and strip the suffix", async ({ tmpDir }) => {
    // Astromotion decks: src/decks/*.deck.mdx joins the graph as `lectures`.
    const dir = join(tmpDir, "decks");
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "week-1.deck.mdx"),
      "---\ntitle: 'Week 1: Introduction'\n---\n\n# Week 1\n",
    );
    await writeFile(join(dir, "notes.md"), "---\ntitle: Not a deck\n---\n");
    const nodes = await readCourseNodes(tmpDir, [
      { key: "lectures", dir: "decks", suffix: ".deck.mdx" },
    ]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      id: "lectures/week-1",
      type: "lectures",
      slug: "week-1",
      title: "Week 1: Introduction",
    });
  });

  fsTest("ignores collections whose dir does not exist", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [{ collection: "topics", slug: "x", frontmatter: "title: X" }]);
    const nodes = await readCourseNodes(tmpDir, [
      { key: "topics" },
      { key: "missing", dir: "content/does-not-exist" },
    ]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].type).toBe("topics");
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
    const nodes = await readCourseNodes(tmpDir, DEFAULT_COLLECTIONS);
    const graph = resolveGraph(nodes);
    expect(graph.errors).toHaveLength(1);
    expect(graph.errors[0]).toMatchObject({
      type: "dangling-ref",
      ref: "topics/nonexistent",
    });
  });

  fsTest("detects dangling embed reference", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      {
        collection: "topics",
        slug: "functions",
        frontmatter: "title: Functions",
        body: "{/* embed: topics/nonexistent */}",
      },
    ]);
    const nodes = await readCourseNodes(tmpDir, DEFAULT_COLLECTIONS);
    const graph = resolveGraph(nodes);
    expect(graph.errors).toHaveLength(1);
    expect(graph.errors[0]).toMatchObject({
      type: "dangling-ref",
      ref: "topics/nonexistent",
    });
  });

  fsTest("resolves valid related links", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      { collection: "topics", slug: "loops", frontmatter: "title: Loops\nrelated:\n  - variables" },
      { collection: "topics", slug: "variables", frontmatter: "title: Variables" },
    ]);
    const nodes = await readCourseNodes(tmpDir, DEFAULT_COLLECTIONS);
    const graph = resolveGraph(nodes);
    expect(graph.errors).toHaveLength(0);
    expect(graph.edges).toEqual([{ from: "topics/loops", to: "topics/variables" }]);
  });

  fsTest("deck embeds become lecture-to-topic edges", async ({ tmpDir }) => {
    await writeMockCourse(tmpDir, [
      { collection: "topics", slug: "overview", frontmatter: "title: Overview" },
    ]);
    const decksDir = join(tmpDir, "decks");
    await mkdir(decksDir, { recursive: true });
    await writeFile(
      join(decksDir, "week-1.deck.mdx"),
      "---\ntitle: Week 1\n---\n\n{/* embed: topics/overview#outcomes */}\n",
    );
    const nodes = await readCourseNodes(tmpDir, [
      { key: "topics" },
      { key: "lectures", dir: "decks", suffix: ".deck.mdx" },
    ]);
    const graph = resolveGraph(nodes);
    expect(graph.errors).toHaveLength(0);
    expect(graph.edges).toEqual([{ from: "lectures/week-1", to: "topics/overview" }]);
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
        frontmatter: "title: Intro Lab\nweek: 1\nrelated:\n  - topics/variables",
      },
      {
        collection: "assessments",
        slug: "01-a1",
        frontmatter: "title: Assignment 1\nweek: 4\nweight: 25\nrelated:\n  - topics/functions",
      },
      {
        collection: "topics",
        slug: "overview",
        frontmatter: "title: Course Overview\ntags:\n  - admin",
      },
    ]);
    const nodes = await readCourseNodes(tmpDir, DEFAULT_COLLECTIONS);
    const graph = resolveGraph(nodes);

    expect(graph.errors).toHaveLength(0);
    expect(graph.nodes).toHaveLength(6);
    expect(graph.edges).toHaveLength(4);
  });
});

describe("writeCourseApi", () => {
  fsTest("writes index.json and per-node JSON files", async ({ tmpDir }) => {
    const srcDir = join(tmpDir, "src");
    const distDir = join(tmpDir, "dist");
    await mkdir(distDir, { recursive: true });

    await writeMockCourse(srcDir, [
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

    const { graph, filesWritten } = await writeCourseApi(srcDir, distDir, DEFAULT_COLLECTIONS);
    expect(graph.errors).toHaveLength(0);
    expect(filesWritten).toBe(4);

    expect(existsSync(join(distDir, "api", "index.json"))).toBe(true);
    expect(existsSync(join(distDir, "api", "topics", "variables.json"))).toBe(true);
    expect(existsSync(join(distDir, "api", "topics", "functions.json"))).toBe(true);
    expect(existsSync(join(distDir, "api", "labs", "01-intro.json"))).toBe(true);
  });

  fsTest("index.json contains all nodes and edges", async ({ tmpDir }) => {
    const srcDir = join(tmpDir, "src");
    const distDir = join(tmpDir, "dist");
    await mkdir(distDir, { recursive: true });

    await writeMockCourse(srcDir, [
      { collection: "topics", slug: "a", frontmatter: "title: A" },
      { collection: "topics", slug: "b", frontmatter: "title: B\nrelated:\n  - a" },
    ]);

    await writeCourseApi(srcDir, distDir, DEFAULT_COLLECTIONS);
    const index = JSON.parse(await readFile(join(distDir, "api", "index.json"), "utf-8"));

    expect(index.nodes).toHaveLength(2);
    expect(index.edges).toHaveLength(1);

    const nodeB = index.nodes.find((n: { id: string }) => n.id === "topics/b");
    expect(nodeB.related).toEqual(["topics/a"]);
  });

  fsTest("per-node JSON includes body and links", async ({ tmpDir }) => {
    const srcDir = join(tmpDir, "src");
    const distDir = join(tmpDir, "dist");
    await mkdir(distDir, { recursive: true });

    await writeMockCourse(srcDir, [
      {
        collection: "topics",
        slug: "base",
        frontmatter: "title: Base\nlinks:\n  - label: Example\n    url: https://example.com",
        body: "Base content here.",
      },
    ]);

    await writeCourseApi(srcDir, distDir, DEFAULT_COLLECTIONS);
    const baseJson = JSON.parse(
      await readFile(join(distDir, "api", "topics", "base.json"), "utf-8"),
    );

    expect(baseJson.title).toBe("Base");
    expect(baseJson.body).toContain("Base content here.");
    expect(baseJson.links).toEqual([{ label: "Example", url: "https://example.com" }]);
  });

  fsTest("threads timezone into index and per-node JSON", async ({ tmpDir }) => {
    const srcDir = join(tmpDir, "src");
    const distDir = join(tmpDir, "dist");
    await mkdir(distDir, { recursive: true });

    await writeMockCourse(srcDir, [
      {
        collection: "assessments",
        slug: "a1",
        frontmatter: "title: Assignment 1\ndue: 2026-08-17",
      },
    ]);

    await writeCourseApi(srcDir, distDir, DEFAULT_COLLECTIONS, "Australia/Canberra");
    const index = JSON.parse(await readFile(join(distDir, "api", "index.json"), "utf-8"));
    const nodeJson = JSON.parse(
      await readFile(join(distDir, "api", "assessments", "a1.json"), "utf-8"),
    );

    expect(index.timezone).toBe("Australia/Canberra");
    expect(nodeJson.timezone).toBe("Australia/Canberra");
    expect(nodeJson.meta.due).toBe("2026-08-17");
  });

  fsTest("writes valid index.json for empty course", async ({ tmpDir }) => {
    const srcDir = join(tmpDir, "src");
    const distDir = join(tmpDir, "dist");
    await mkdir(join(srcDir, "content"), { recursive: true });
    await mkdir(distDir, { recursive: true });

    const { graph, filesWritten } = await writeCourseApi(srcDir, distDir, DEFAULT_COLLECTIONS);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
    expect(filesWritten).toBe(1);

    const index = JSON.parse(await readFile(join(distDir, "api", "index.json"), "utf-8"));
    expect(index.nodes).toEqual([]);
    expect(index.edges).toEqual([]);
  });

  fsTest("returns errors for invalid graph", async ({ tmpDir }) => {
    const srcDir = join(tmpDir, "src");
    const distDir = join(tmpDir, "dist");
    await mkdir(distDir, { recursive: true });

    await writeMockCourse(srcDir, [
      {
        collection: "topics",
        slug: "broken",
        frontmatter: "title: Broken\nrelated:\n  - nonexistent",
      },
    ]);

    const { graph } = await writeCourseApi(srcDir, distDir, DEFAULT_COLLECTIONS);
    expect(graph.errors).toHaveLength(1);
    expect(graph.errors[0].type).toBe("dangling-ref");
  });

  fsTest("ignores files in unconfigured directories", async ({ tmpDir }) => {
    const srcDir = join(tmpDir, "src");
    const distDir = join(tmpDir, "dist");
    await mkdir(distDir, { recursive: true });

    // procedures/ and admin/ aren't in DEFAULT_COLLECTIONS — content in
    // those directories is silently skipped, not treated as a collection.
    await writeMockCourse(srcDir, [
      { collection: "topics", slug: "git", frontmatter: "title: Git" },
      { collection: "procedures", slug: "submit", frontmatter: "title: Submitting" },
      { collection: "admin", slug: "policy", frontmatter: "title: Policy" },
    ]);

    const { graph, filesWritten } = await writeCourseApi(srcDir, distDir, DEFAULT_COLLECTIONS);
    expect(graph.errors).toHaveLength(0);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].id).toBe("topics/git");
    expect(filesWritten).toBe(2); // index.json + topics/git.json
    expect(existsSync(join(distDir, "api", "procedures", "submit.json"))).toBe(false);
    expect(existsSync(join(distDir, "api", "admin", "policy.json"))).toBe(false);
  });

  fsTest("API paths use the collection key as-is", async ({ tmpDir }) => {
    const srcDir = join(tmpDir, "src");
    const distDir = join(tmpDir, "dist");
    await mkdir(distDir, { recursive: true });

    await writeMockCourse(srcDir, [
      { collection: "crits", slug: "01-prototype", frontmatter: "title: Prototype 1\nweek: 4" },
    ]);

    const { graph } = await writeCourseApi(srcDir, distDir, [{ key: "crits" }]);
    expect(graph.errors).toHaveLength(0);
    expect(existsSync(join(distDir, "api", "crits", "01-prototype.json"))).toBe(true);
  });
});
