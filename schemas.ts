import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

const weekSchema = z.coerce.number().int().min(1).max(12);

export interface DefineCourseCollectionOptions {
  /** Base directory for the content glob. Defaults to the convention used by the example. */
  base?: string;
  /** Glob pattern for content files. Defaults to `**\/*.{md,mdx}`. */
  pattern?: string;
  /** Allow arbitrary additional frontmatter fields (default: true). */
  passthrough?: boolean;
}

function loader(base: string, pattern = "**/*.{md,mdx}") {
  return glob({ pattern, base });
}

function maybePassthrough<S extends z.ZodRawShape>(schema: z.ZodObject<S>, passthrough: boolean) {
  return passthrough ? schema.passthrough() : schema;
}

/**
 * `topics` collection — atomic content chunks that are browsable standalone
 * at `/topics/<slug>/` and composable into lecture decks via topic markers.
 */
export function defineTopicsCollection(options: DefineCourseCollectionOptions = {}) {
  const { base = "src/content/topics", pattern, passthrough = true } = options;
  return defineCollection({
    loader: loader(base, pattern),
    schema: maybePassthrough(
      z.object({
        title: z.string(),
        summary: z.string().nullish(),
        tags: z.array(z.string()).default([]),
        related: z.array(z.string()).default([]),
        references: z.array(z.string().url()).default([]),
        published: z.coerce.boolean().default(true),
      }),
      passthrough,
    ),
  });
}

/**
 * `labs` collection — weekly hands-on exercises. Each lab has a `week`
 * (1-12) and an optional `repo` URL.
 */
export function defineLabsCollection(options: DefineCourseCollectionOptions = {}) {
  const { base = "src/content/labs", pattern, passthrough = true } = options;
  return defineCollection({
    loader: loader(base, pattern),
    schema: maybePassthrough(
      z.object({
        title: z.string(),
        summary: z.string().nullish(),
        week: weekSchema,
        repo: z.string().url().nullish(),
        related: z.array(z.string()).default([]),
        published: z.coerce.boolean().default(true),
      }),
      passthrough,
    ),
  });
}

/**
 * `assessments` collection — assignments and projects. Adds `due` date and
 * `weight` (percentage of final grade) to the shape used by labs.
 */
export function defineAssessmentsCollection(options: DefineCourseCollectionOptions = {}) {
  const { base = "src/content/assessments", pattern, passthrough = true } = options;
  return defineCollection({
    loader: loader(base, pattern),
    schema: maybePassthrough(
      z.object({
        title: z.string(),
        summary: z.string().nullish(),
        week: weekSchema,
        repo: z.string().url().nullish(),
        due: z.coerce.date().nullish(),
        weight: z.coerce.number().nullish(),
        related: z.array(z.string()).default([]),
        published: z.coerce.boolean().default(true),
      }),
      passthrough,
    ),
  });
}

export interface DefineCourseCollectionsOptions {
  /** Allow arbitrary additional frontmatter fields across all collections (default: true). */
  passthrough?: boolean;
  /** Shared glob pattern across all collections. Defaults to `**\/*.{md,mdx}`. */
  pattern?: string;
}

/**
 * Convenience helper: returns all three course collections at once so a
 * consumer's `content.config.ts` is a one-liner.
 *
 * ```ts
 * export const collections = defineCourseCollections();
 * ```
 *
 * Each collection uses its conventional base directory (`src/content/topics`,
 * etc.). If you need to customise individual collection bases, call the
 * single-collection factories directly.
 *
 * Only three collections exist because they have genuinely distinct schemas:
 * topics (general reusable content), labs (week-indexed exercises), and
 * assessments (week + due + weight). Anything else — policy pages, how-to
 * guides, admin content — belongs in topics with a tag (e.g. `admin`,
 * `practice`). Consumers can then render tag-filtered listing pages under
 * routes like `/admin/` that link into `/topics/<slug>/`.
 */
export function defineCourseCollections(options: DefineCourseCollectionsOptions = {}) {
  return {
    topics: defineTopicsCollection(options),
    labs: defineLabsCollection(options),
    assessments: defineAssessmentsCollection(options),
  };
}
