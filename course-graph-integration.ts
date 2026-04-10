import type { AstroIntegration } from "astro";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeCourseApi } from "./course-content.js";

export default function courseGraph(): AstroIntegration {
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

        const contentDir = join(srcDir, "content");
        const { graph, filesWritten } = await writeCourseApi(contentDir, distPath);
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
