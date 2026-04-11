import { getCollection } from "astro:content";
import type { CollectionEntry, CollectionKey } from "astro:content";

/**
 * Drop-in replacement for `getCollection` that filters out entries with
 * `published: false`. The three course schemas from
 * `astro-course-anu/schemas` all default `published` to `true`, so any
 * entry that has been explicitly marked unpublished is excluded.
 *
 * Accepts an optional secondary filter with the same signature as the
 * second argument to `getCollection`, applied after the published check.
 *
 * ```ts
 * // replace:
 * const topics = (await getCollection("topics")).filter(t => t.data.published);
 * // with:
 * const topics = await getPublishedCollection("topics");
 *
 * // with an extra filter:
 * const admin = await getPublishedCollection("topics", (t) =>
 *   t.data.tags.includes("admin"),
 * );
 * ```
 *
 * Safe to use on collections whose schema does not define `published` —
 * missing fields are treated as published.
 */
export async function getPublishedCollection<C extends CollectionKey>(
  collection: C,
  filter?: (entry: CollectionEntry<C>) => boolean,
): Promise<CollectionEntry<C>[]> {
  return getCollection(collection, (entry) => {
    const data = entry.data as { published?: boolean };
    if (data.published === false) return false;
    return filter ? filter(entry) : true;
  });
}
