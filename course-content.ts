import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join, relative, extname, basename } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  resolveEdgeTarget,
  resolveGraph,
  generateIndexJson,
  generateNodeJson,
} from "./course-graph.js";
import type { ContentNode, ResolvedGraph } from "./course-graph.js";

/**
 * Configuration for a single graph-participating collection. `key` is the
 * Astro collection name (used by consumers via `getPublishedCollection`),
 * `dir` is the directory under `src/content/` to walk, and `type` is the
 * singular graph node type (becomes the `/api/<type>/<slug>.json`
 * segment and the cross-type prefix for `related: ["<type>/<slug>"]`
 * edges).
 */
export interface CourseCollection {
  key: string;
  dir: string;
  type: string;
}

function parseNodeLocation(
  filePath: string,
  contentDir: string,
  dirToType: Map<string, string>,
): { type: string; slug: string } | null {
  const rel = relative(contentDir, filePath);
  const parts = rel.split("/");
  if (parts.length < 2) return null;

  const type = dirToType.get(parts[0]);
  if (!type) return null;

  const slug = basename(parts[parts.length - 1], extname(parts[parts.length - 1]));
  return { type, slug };
}

async function collectMarkdownFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (/\.(md|mdx)$/.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  await walk(dir);
  return results;
}

function toStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === "string" && val) return [val];
  return [];
}

export async function readCourseNodes(
  contentDir: string,
  collections: CourseCollection[],
): Promise<ContentNode[]> {
  const dirToType = new Map(collections.map((c) => [c.dir, c.type]));
  const nodes: ContentNode[] = [];

  for (const collection of collections) {
    const collectionDir = join(contentDir, collection.dir);
    const files = await collectMarkdownFiles(collectionDir);

    for (const filePath of files) {
      const location = parseNodeLocation(filePath, contentDir, dirToType);
      if (!location) continue;

      const source = await readFile(filePath, "utf-8");
      const fmMatch = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
      if (!fmMatch) continue;

      const raw = parseYaml(fmMatch[1]);
      if (typeof raw !== "object" || raw === null) continue;

      const fm = raw as Record<string, unknown>;
      if (fm.published === false) continue;

      const title = fm.title;
      if (typeof title !== "string") continue;

      const { type, slug } = location;
      const id = `${type}/${slug}`;

      const rawRelated = toStringArray(fm.related);

      const {
        title: _t,
        summary: _s,
        description: _d,
        tags: _tags,
        related: _rel,
        published: _p,
        ...rest
      } = fm;

      nodes.push({
        id,
        type,
        slug,
        title,
        description:
          typeof fm.description === "string"
            ? fm.description
            : typeof fm.summary === "string"
              ? fm.summary
              : undefined,
        tags: toStringArray(fm.tags),
        related: rawRelated.map((r) => resolveEdgeTarget(type, r)),
        meta: rest,
        body: fmMatch[2].trim(),
      });
    }
  }

  return nodes;
}

export interface CourseApiResult {
  graph: ResolvedGraph;
  filesWritten: number;
}

export async function writeCourseApi(
  contentDir: string,
  distPath: string,
  collections: CourseCollection[],
): Promise<CourseApiResult> {
  const nodes = await readCourseNodes(contentDir, collections);
  const graph = resolveGraph(nodes);

  const apiDir = join(distPath, "api");
  await mkdir(apiDir, { recursive: true });

  await writeFile(join(apiDir, "index.json"), generateIndexJson(graph));
  let filesWritten = 1;

  for (const node of graph.nodes) {
    const nodeDir = join(apiDir, node.type);
    await mkdir(nodeDir, { recursive: true });
    await writeFile(join(nodeDir, `${node.slug}.json`), generateNodeJson(node));
    filesWritten++;
  }

  return { graph, filesWritten };
}
