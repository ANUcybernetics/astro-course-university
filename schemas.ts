import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";
import type { CourseCollectionSpec, CourseCollectionsSpec } from "./collections.js";
import { courseNodeSchema } from "./node-schema.js";

export type { CourseCollectionSpec, CourseCollectionsSpec } from "./collections.js";
export { courseNodeSchema } from "./node-schema.js";

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
 * `people` collection — the cast of the course: convenor, TAs, guest
 * lecturers, and anyone else who gets a byline. Entries may be referenced
 * by `author` fields on other collections. The markdown body is an optional bio.
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
          role: z.enum(["convenor", "tutor", "guest", "other"]).nullish(),
          email: z.email().nullish(),
          url: z.url().nullish(),
          photo: image().nullish(),
          published: z.coerce.boolean().default(true),
        }),
        passthrough,
      ),
  });
}

type SpecSchema<C> = C extends { schema: (node: z.ZodObject<z.ZodRawShape>) => infer S }
  ? S
  : typeof courseNodeSchema;

type CourseCollectionsOf<T extends CourseCollectionsSpec> = {
  [K in keyof T as T[K] extends { collection: false } ? never : K]: ReturnType<
    typeof defineCollection<SpecSchema<T[K]>>
  >;
};

export interface DefineCourseCollectionsOptions {
  /** Allow arbitrary additional frontmatter fields on every collection
   *  (default: true). Unknown keys land in each node's `meta` in the API. */
  passthrough?: boolean;
}

/**
 * Turn one collections declaration into the Astro collections it names, so
 * `src/content.config.ts` and `courseGraph()` read the same object:
 *
 * ```ts
 * // src/course-collections.ts — a plain module both config files import
 * import { z } from "astro/zod";
 * import type { CourseCollectionsSpec } from "astro-course-university";
 *
 * export const courseCollections = {
 *   topics: {},
 *   labs: { schema: (node) => node.extend({ week: z.number().int() }) },
 *   lectures: { dir: "decks", suffix: ".deck.mdx", collection: false },
 * } satisfies CourseCollectionsSpec;
 *
 * // src/content.config.ts
 * export const collections = {
 *   ...defineCourseCollections(courseCollections),
 *   people: definePeopleCollection(),
 * };
 *
 * // astro.config.ts
 * courseGraph({ collections: courseCollections });
 * ```
 *
 * Each key becomes a collection over `src/<dir>` (default `content/<key>`)
 * matching `suffix` (default `.md`/`.mdx`), with `courseNodeSchema` or the
 * spec's extension of it. `collection: false` keys are graph-only and are
 * skipped here.
 */
export function defineCourseCollections<T extends CourseCollectionsSpec>(
  spec: T,
  options: DefineCourseCollectionsOptions = {},
): CourseCollectionsOf<T> {
  const { passthrough = true } = options;
  const collections: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(spec) as [string, CourseCollectionSpec][]) {
    if (entry.collection === false) continue;
    const base = `src/${entry.dir ?? `content/${key}`}`;
    const pattern = entry.suffix ? `**/*${entry.suffix}` : undefined;
    const schema = entry.schema ? entry.schema(courseNodeSchema) : courseNodeSchema;
    collections[key] = defineCollection({
      loader: loader(base, pattern),
      schema: maybePassthrough(schema, passthrough),
    });
  }
  return collections as CourseCollectionsOf<T>;
}
