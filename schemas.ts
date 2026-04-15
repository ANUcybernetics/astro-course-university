import { defineCollection, reference } from "astro:content";
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

/**
 * `news` collection — dated announcements (class news, guest-lecture
 * posts). Each entry requires a `date` and an `author` reference into
 * the `people` collection, so bylines link to a person page and typos
 * in `author:` fail the build.
 *
 * News is deliberately kept out of the content graph in `courseGraph()`:
 * it's ephemeral and chronological, not a reusable pedagogical unit.
 * Cross-references from news to other content are just markdown links.
 */
export function defineNewsCollection(options: DefineCourseCollectionOptions = {}) {
  const { base = "src/content/news", pattern, passthrough = true } = options;
  return defineCollection({
    loader: loader(base, pattern),
    schema: maybePassthrough(
      z.object({
        title: z.string(),
        date: z.coerce.date(),
        author: reference("people"),
        summary: z.string().nullish(),
        tags: z.array(z.string()).default([]),
        pinned: z.coerce.boolean().default(false),
        published: z.coerce.boolean().default(true),
      }),
      passthrough,
    ),
  });
}

/**
 * `people` collection — the cast of the course: convenor, TAs, guest
 * lecturers, and anyone else who gets a byline. Entries are referenced
 * by `news.author` (and may be referenced by future `author` fields on
 * other collections). The markdown body is an optional bio.
 *
 * Photos use Astro's `image()` helper so they go through the image
 * pipeline like every other image in the theme.
 */
export function definePeopleCollection(options: DefineCourseCollectionOptions = {}) {
  const { base = "src/content/people", pattern, passthrough = true } = options;
  return defineCollection({
    loader: loader(base, pattern),
    schema: ({ image }) =>
      maybePassthrough(
        z.object({
          title: z.string(),
          affiliation: z.string().nullish(),
          role: z.enum(["convenor", "ta", "guest", "other"]).nullish(),
          email: z.string().email().nullish(),
          url: z.string().url().nullish(),
          photo: image().nullish(),
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
 * Convenience helper: returns all five course collections at once so a
 * consumer's `content.config.ts` is a one-liner.
 *
 * ```ts
 * export const collections = defineCourseCollections();
 * ```
 *
 * Each collection uses its conventional base directory
 * (`src/content/topics`, `src/content/news`, etc.). If a directory
 * doesn't exist, Astro's glob loader matches nothing and the collection
 * is empty — safe to enable all five even if a consumer only uses some.
 *
 * The five collections split along genuinely distinct schemas:
 *
 * - **topics** — general reusable content (graph-participating)
 * - **labs** — week-indexed exercises (graph-participating)
 * - **assessments** — week + due + weight (graph-participating)
 * - **news** — dated announcements with an author reference
 * - **people** — convenor, TAs, guest lecturers; referenced by `news.author`
 *
 * Anything else — policy pages, how-to guides, admin content — belongs in
 * topics with a tag (e.g. `admin`, `practice`). Consumers can then render
 * tag-filtered listing pages under routes like `/admin/` that link into
 * `/topics/<slug>/`.
 *
 * Only topics/labs/assessments participate in the content graph emitted
 * by `courseGraph()`; news and people are orthogonal.
 */
export function defineCourseCollections(options: DefineCourseCollectionsOptions = {}) {
  return {
    topics: defineTopicsCollection(options),
    labs: defineLabsCollection(options),
    assessments: defineAssessmentsCollection(options),
    news: defineNewsCollection(options),
    people: definePeopleCollection(options),
  };
}
