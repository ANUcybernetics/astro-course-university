import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import { parse as parseYaml } from "yaml";
import {
  resolveEdgeTarget,
  parseEmbedRefs,
  resolveGraph,
  symmetriseRelated,
  generateIndexJson,
  generateNodeJson,
} from "./course-graph.js";
import type { ContentNode, ExternalLink, ResolvedGraph } from "./course-graph.js";

/**
 * Configuration for a single graph-participating collection. `key` is
 * the Astro collection name, and it names everything: the graph node
 * type, the `/api/<key>/<slug>.json` path segment, and the
 * cross-collection prefix in refs (`related: ["<key>/<slug>"]`) — one
 * word, matching the site's `/<key>/<slug>/` URLs.
 */
export interface CourseCollection {
  key: string;
  /**
   * Directory to walk, relative to the project `src/` dir. Defaults to
   * `content/<key>`. Lets non-`src/content` collections (e.g. astromotion
   * decks in `src/decks/`) join the graph.
   */
  dir?: string;
  /**
   * Filename suffix to match and strip when deriving slugs (e.g.
   * `".deck.mdx"`). Files not ending in the suffix are skipped. Defaults
   * to plain `.md`/`.mdx` with the extension stripped.
   */
  suffix?: string;
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

function toExternalLinks(val: unknown): ExternalLink[] {
  if (!Array.isArray(val)) return [];
  return val.flatMap((item) => {
    if (item === null || typeof item !== "object") return [];
    const { label, url } = item as Record<string, unknown>;
    return typeof label === "string" && typeof url === "string" ? [{ label, url }] : [];
  });
}

export async function readCourseNodes(
  srcDir: string,
  collections: CourseCollection[],
): Promise<ContentNode[]> {
  const nodes: ContentNode[] = [];

  for (const collection of collections) {
    const type = collection.key;
    const collectionDir = join(srcDir, collection.dir ?? join("content", collection.key));
    const files = await collectMarkdownFiles(collectionDir);

    for (const filePath of files) {
      const filename = basename(filePath);
      let slug: string;
      if (collection.suffix) {
        if (!filename.endsWith(collection.suffix)) continue;
        slug = filename.slice(0, -collection.suffix.length);
      } else {
        slug = basename(filename, extname(filename));
      }
      if (!slug) continue;

      const source = await readFile(filePath, "utf-8");
      const fmMatch = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
      if (!fmMatch) continue;

      const raw = parseYaml(fmMatch[1]);
      if (typeof raw !== "object" || raw === null) continue;

      const fm = raw as Record<string, unknown>;
      if (fm.published === false) continue;

      const title = fm.title;
      if (typeof title !== "string") continue;

      const id = `${type}/${slug}`;
      const body = fmMatch[2].trim();

      // An embed implies a related edge: `{/* embed: <ref> */}` directives
      // in the body merge into the declared `related` refs, deduplicated,
      // so transcluding a node never needs a second declaration.
      const related = [
        ...new Set(
          [...toStringArray(fm.related), ...parseEmbedRefs(body)].map((r) =>
            resolveEdgeTarget(type, r),
          ),
        ),
      ];

      const {
        title: _t,
        summary: _s,
        description: _d,
        tags: _tags,
        related: _rel,
        links: _links,
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
        related,
        links: toExternalLinks(fm.links),
        meta: rest,
        body,
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
  srcDir: string,
  distPath: string,
  collections: CourseCollection[],
): Promise<CourseApiResult> {
  const nodes = await readCourseNodes(srcDir, collections);
  const graph = resolveGraph(nodes);

  const apiDir = join(distPath, "api");
  await mkdir(apiDir, { recursive: true });

  await writeFile(join(apiDir, "index.json"), generateIndexJson(graph));
  let filesWritten = 1;

  const related = symmetriseRelated(graph);
  for (const node of graph.nodes) {
    const nodeDir = join(apiDir, node.type);
    await mkdir(nodeDir, { recursive: true });
    await writeFile(
      join(nodeDir, `${node.slug}.json`),
      generateNodeJson(node, related.get(node.id)),
    );
    filesWritten++;
  }

  return { graph, filesWritten };
}
