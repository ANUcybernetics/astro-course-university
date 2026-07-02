import type { AstroIntegration } from "astro";
import { fileURLToPath } from "node:url";
import { writeCourseApi } from "./course-content.js";
import type { CourseCollection } from "./course-content.js";

export interface CourseGraphOptions {
  /**
   * Collections that participate in the content graph. Each entry names
   * an Astro collection by `key`, which doubles as the graph node type,
   * the `/api/<key>/<slug>.json` path segment, and the cross-collection
   * ref prefix (`related: ["<key>/<slug>"]`). `dir` (relative to `src/`,
   * default `content/<key>`) and `suffix` (e.g. `".deck.mdx"`) let
   * collections outside `src/content/` join the graph.
   */
  collections: CourseCollection[];
}

export default function courseGraph(options: CourseGraphOptions): AstroIntegration {
  const { collections } = options;
  let srcDir: string;

  return {
    name: "course-graph",
    hooks: {
      "astro:config:setup": ({ config }) => {
        srcDir = fileURLToPath(config.srcDir);
      },
      "astro:build:done": async ({ dir, logger }) => {
        let distPath: string;
        try {
          distPath = dir instanceof URL ? fileURLToPath(dir) : String(dir);
        } catch (e) {
          logger.error(`Course graph generation failed: ${e}`);
          return;
        }

        const { graph, filesWritten } = await writeCourseApi(srcDir, distPath, collections);
        const errorCount = graph.errors.length;
        if (errorCount > 0) {
          const lines = graph.errors.slice(0, 20).map((e) => `  ${e.type}: ${e.detail}`);
          if (errorCount > 20) lines.push(`  ... and ${errorCount - 20} more`);
          throw new Error(`Course graph has ${errorCount} error(s):\n${lines.join("\n")}`);
        }
        logger.info(
          `Generated course API: ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${filesWritten} files.`,
        );
      },
    },
  };
}
