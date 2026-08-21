import type { AstroIntegration } from "astro";
import { fileURLToPath } from "node:url";
import { z } from "astro/zod";
import { writeCourseApi } from "./course-content.js";
import type { CourseCollection } from "./course-content.js";
import type { CourseMeta } from "./course-graph.js";

/**
 * Zod shape for the `course` option: the course-record facts every course
 * site restates (code, title, session, teaching dates, description,
 * learning outcomes). Strict — a typo'd field name fails the build, which
 * is the point: a new course built from a template won't build until the
 * required facts are filled in. `startDate`/`endDate` are bare ISO
 * `YYYY-MM-DD` strings interpreted in the site `timezone`, consistent
 * with every other frontmatter date.
 */
export const courseMetaSchema = z
  .strictObject({
    code: z.string().min(1),
    title: z.string().min(1),
    session: z.string().min(1),
    year: z.number().int().min(2000).max(2200).optional(),
    level: z.number().int().min(1).max(9).optional(),
    startDate: z.iso.date(),
    endDate: z.iso.date(),
    description: z.string().min(1),
    tags: z.array(z.string()).default([]),
    learningOutcomes: z.array(z.string()).default([]),
  })
  .refine((c) => c.startDate <= c.endDate, {
    message: "startDate must not be after endDate",
  });

/** Input shape for the `course` option (`learningOutcomes` may be omitted). */
export type CourseMetaInput = z.input<typeof courseMetaSchema>;

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
  /**
   * IANA timezone name (e.g. `"Australia/Canberra"`) the site's bare
   * frontmatter dates (`due: 2026-08-17`) should be interpreted in.
   * Emitted verbatim as a `timezone` field on `/api/index.json` and every
   * per-node JSON — dates themselves are never rewritten to UTC offsets,
   * which would bake in one side of a DST transition. Omit and the field
   * is absent.
   */
  timezone?: string;
  /**
   * Course-level metadata (`courseMetaSchema`): code, title, session,
   * teaching `startDate`/`endDate` (bare ISO dates, local to `timezone`),
   * description, and optional learning outcomes. Validated at config
   * time; emitted as a `course` block on `/api/index.json` so the API is
   * self-describing. Omit and the block is absent.
   */
  course?: CourseMetaInput;
  /**
   * Public catalogue URL for this course. When supplied it becomes the API's
   * `canonicalUrl`; otherwise the integration derives that URL from Astro's
   * `site` and `base`.
   */
  canonicalUrl?: string;
}

export default function courseGraph(options: CourseGraphOptions): AstroIntegration {
  const { collections, timezone } = options;
  let course: CourseMeta | undefined;
  if (options.course) {
    const parsed = courseMetaSchema.safeParse(options.course);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `  ${i.path.join(".") || "(course)"}: ${i.message}`)
        .join("\n");
      throw new Error(`courseGraph: invalid course metadata:\n${issues}`);
    }
    course = parsed.data;
  }
  if (timezone) {
    try {
      void new Intl.DateTimeFormat("en", { timeZone: timezone });
    } catch {
      throw new Error(
        `courseGraph: invalid timezone "${timezone}" — use an IANA zone name like "Australia/Canberra"`,
      );
    }
  }
  if (options.canonicalUrl) {
    try {
      new URL(options.canonicalUrl);
    } catch {
      throw new Error(`courseGraph: invalid canonicalUrl "${options.canonicalUrl}"`);
    }
  }
  let srcDir: string;
  let canonicalUrl = options.canonicalUrl;

  return {
    name: "course-graph",
    hooks: {
      "astro:config:setup": ({ config }) => {
        srcDir = fileURLToPath(config.srcDir);
        if (!canonicalUrl && config.site) {
          canonicalUrl = new URL(config.base.replace(/^\//, ""), config.site).href;
        }
      },
      "astro:build:done": async ({ dir, logger }) => {
        let distPath: string;
        try {
          distPath = dir instanceof URL ? fileURLToPath(dir) : String(dir);
        } catch (e) {
          logger.error(`Course graph generation failed: ${e}`);
          return;
        }

        const { graph, filesWritten } = await writeCourseApi(
          srcDir,
          distPath,
          collections,
          timezone,
          course,
          canonicalUrl,
        );
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
