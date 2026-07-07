import { defineCollection, reference } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";

export interface DefineCourseCollectionOptions {
  /** Base directory for the content glob. Defaults to a per-collection convention. */
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
  return passthrough ? schema.loose() : schema;
}

/**
 * Shared Zod shape for any collection that participates in the course
 * content graph (`courseGraph()` integration). Consumers compose their
 * own collections by extending this with type-specific fields and
 * passing the result to Astro's `defineCollection`:
 *
 * ```ts
 * import { defineCollection } from "astro:content";
 * import { glob } from "astro/loaders";
 * import { courseNodeSchema } from "astro-course-anu/schemas";
 *
 * export const collections = {
 *   crits: defineCollection({
 *     loader: glob({ pattern: "**\/*.{md,mdx}", base: "src/content/crits" }),
 *     schema: courseNodeSchema.extend({
 *       week: z.number().int().min(1).max(13),
 *       repo: z.url().nullish(),
 *     }).loose(),
 *   }),
 * };
 * ```
 *
 * The shape fields are the ones `courseGraph()` reads when walking
 * content: `title` and `description` flow into the JSON API (the same
 * `description` astromotion decks put in `<meta name="description">` —
 * one name for the concept across the ecosystem), `tags` drives
 * tag-filtered listings, `related` drives the undirected graph edges
 * (refs to content within the site, `<collection>/<slug>` or a bare
 * same-collection slug), and `links` carries external URLs (rendered
 * alongside related content but never graph edges).
 *
 * `published` and `draft` are two orthogonal axes, not one lifecycle.
 * `published: false` is visibility: it keeps the node out of the graph,
 * listings, and llms.txt entirely (the page still builds at its URL).
 * `draft: true` is finality: the node stays visible everywhere but
 * consumers render it with a not-yet-final marker (llms.txt does this
 * automatically). All four combinations are coherent — an unpublished
 * draft is an unlisted preview, reachable by URL, banner intact.
 */
export const courseNodeSchema = z.object({
  title: z.string(),
  description: z.string().nullish(),
  tags: z.array(z.string()).default([]),
  related: z.array(z.string()).default([]),
  links: z.array(z.object({ label: z.string(), url: z.url() })).default([]),
  published: z.coerce.boolean().default(true),
  draft: z.coerce.boolean().default(false),
});

/**
 * `news` collection — dated announcements (class news, guest-lecture
 * posts). Each entry requires a `title`, `date` (coerced), and `author`
 * (a `reference("people")`), so bylines link to a person page and typos
 * in `author:` fail the build.
 *
 * News is deliberately kept out of the content graph in `courseGraph()`:
 * it's ephemeral and chronological, not a reusable pedagogical unit.
 * Cross-references from news to other content are just markdown links.
 *
 * The `reference("people")` wiring is the reason this still ships as a
 * factory rather than as a bare schema like `courseNodeSchema`.
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
        description: z.string().nullish(),
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
 * pipeline like every other image in the theme. That `image()` wiring
 * is the reason this still ships as a factory rather than as a bare
 * schema like `courseNodeSchema`.
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
          email: z.email().nullish(),
          url: z.url().nullish(),
          photo: image().nullish(),
          published: z.coerce.boolean().default(true),
        }),
        passthrough,
      ),
  });
}
