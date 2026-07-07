import { describe, expect, test, vi } from "vitest";
import { z } from "astro/zod";

vi.mock("astro:content", () => ({
  defineCollection: (config: unknown) => config,
  reference: (collection: string) => z.string().transform((id) => ({ collection, id })),
}));

vi.mock("astro/loaders", () => ({
  glob: (opts: unknown) => opts,
}));

// Imports must come after vi.mock — vitest hoists mocks so this works.
import { courseNodeSchema, defineNewsCollection, definePeopleCollection } from "./schemas.js";

type CollectionLike = { schema: unknown };

function resolveSchema(
  collection: CollectionLike,
  ctx: { image: () => z.ZodTypeAny } = { image: () => z.any() },
): z.ZodTypeAny {
  const s = collection.schema;
  return typeof s === "function"
    ? (s as (c: typeof ctx) => z.ZodTypeAny)(ctx)
    : (s as z.ZodTypeAny);
}

describe("courseNodeSchema", () => {
  test("parses a minimal node (title only)", () => {
    const parsed = courseNodeSchema.parse({ title: "Variables" });
    expect(parsed).toMatchObject({
      title: "Variables",
      tags: [],
      related: [],
      published: true,
      draft: false,
    });
  });

  test("parses a fully-populated node", () => {
    const parsed = courseNodeSchema.parse({
      title: "Functions",
      description: "Reusable units of behaviour",
      tags: ["concept", "fundamentals"],
      related: ["variables", "scope"],
      links: [{ label: "MDN", url: "https://developer.mozilla.org" }],
      published: false,
      draft: true,
    });
    expect(parsed).toMatchObject({
      title: "Functions",
      description: "Reusable units of behaviour",
      tags: ["concept", "fundamentals"],
      related: ["variables", "scope"],
      links: [{ label: "MDN", url: "https://developer.mozilla.org" }],
      published: false,
      draft: true,
    });
  });

  test("links default to empty array", () => {
    const parsed = courseNodeSchema.parse({ title: "x" });
    expect(parsed.links).toEqual([]);
  });

  test("rejects links without a label", () => {
    expect(() =>
      courseNodeSchema.parse({ title: "x", links: [{ url: "https://example.com" }] }),
    ).toThrow();
  });

  test("rejects links with a malformed url", () => {
    expect(() =>
      courseNodeSchema.parse({ title: "x", links: [{ label: "bad", url: "not a url" }] }),
    ).toThrow();
  });

  test("rejects missing title", () => {
    expect(() => courseNodeSchema.parse({})).toThrow();
  });

  test("rejects non-string title", () => {
    expect(() => courseNodeSchema.parse({ title: 42 })).toThrow();
  });

  test("respects explicit published: false", () => {
    const parsed = courseNodeSchema.parse({ title: "x", published: false });
    expect(parsed.published).toBe(false);
  });

  test("does not include week/repo/due/weight (consumer-defined)", () => {
    // courseNodeSchema is the bare graph shape — type-specific fields like
    // week or weight live on the consumer's extended schema. The bare
    // schema strips unknown fields when parsed strictly.
    const strict = courseNodeSchema.strict();
    expect(() => strict.parse({ title: "x", week: 1 })).toThrow();
  });

  test("extends cleanly with type-specific fields", () => {
    const critsSchema = courseNodeSchema.extend({
      week: z.number().int().min(1).max(13),
      repo: z.url().nullish(),
    });
    const parsed = critsSchema.parse({
      title: "Prototype 1 crit",
      week: 4,
      repo: "https://github.com/example/repo",
    });
    expect(parsed).toMatchObject({
      title: "Prototype 1 crit",
      week: 4,
      repo: "https://github.com/example/repo",
      tags: [],
      published: true,
    });
  });
});

describe("defineNewsCollection", () => {
  const schema = resolveSchema(defineNewsCollection());

  test("parses a valid news post with all fields", () => {
    const parsed = schema.parse({
      title: "Assignment 1 extended",
      date: "2026-04-14",
      author: "ben-swift",
      description: "Deadline pushed to Friday.",
      tags: ["announcement"],
      pinned: true,
    });
    expect(parsed).toMatchObject({
      title: "Assignment 1 extended",
      author: { collection: "people", id: "ben-swift" },
      description: "Deadline pushed to Friday.",
      tags: ["announcement"],
      pinned: true,
      published: true, // default
    });
    expect(parsed.date).toBeInstanceOf(Date);
  });

  test("applies defaults for tags, pinned, published", () => {
    const parsed = schema.parse({
      title: "Week 5 crit released",
      date: "2026-04-01",
      author: "jane-doe",
    });
    expect(parsed).toMatchObject({
      tags: [],
      pinned: false,
      published: true,
    });
  });

  test("rejects missing title", () => {
    expect(() => schema.parse({ date: "2026-04-14", author: "ben-swift" })).toThrow();
  });

  test("rejects missing date", () => {
    expect(() => schema.parse({ title: "Hi", author: "ben-swift" })).toThrow();
  });

  test("rejects missing author (required reference)", () => {
    expect(() => schema.parse({ title: "Hi", date: "2026-04-14" })).toThrow();
  });

  test("coerces date from string", () => {
    const parsed = schema.parse({
      title: "x",
      date: "2026-04-14",
      author: "a",
    });
    expect(parsed.date.getUTCFullYear()).toBe(2026);
  });

  test("rejects invalid date string", () => {
    expect(() => schema.parse({ title: "x", date: "not-a-date", author: "a" })).toThrow();
  });

  test("passthrough preserves unknown fields", () => {
    const parsed = schema.parse({
      title: "x",
      date: "2026-04-14",
      author: "a",
      customField: 42,
    });
    expect((parsed as { customField: unknown }).customField).toBe(42);
  });

  test("passthrough: false strips unknown fields", () => {
    const strict = resolveSchema(defineNewsCollection({ passthrough: false }));
    const parsed = strict.parse({
      title: "x",
      date: "2026-04-14",
      author: "a",
      customField: 42,
    });
    expect((parsed as Record<string, unknown>).customField).toBeUndefined();
  });
});

describe("definePeopleCollection", () => {
  const schema = resolveSchema(definePeopleCollection());

  test("parses a valid person with all fields", () => {
    const parsed = schema.parse({
      title: "Ben Swift",
      affiliation: "ANU School of Cybernetics",
      role: "convenor",
      email: "ben.swift@anu.edu.au",
      url: "https://benswift.me",
      photo: { src: "/x.avif", width: 100, height: 100, format: "avif" },
    });
    expect(parsed).toMatchObject({
      title: "Ben Swift",
      affiliation: "ANU School of Cybernetics",
      role: "convenor",
      email: "ben.swift@anu.edu.au",
      url: "https://benswift.me",
      published: true,
    });
  });

  test("parses a minimal person (title only)", () => {
    const parsed = schema.parse({ title: "Anonymous" });
    expect(parsed).toMatchObject({ title: "Anonymous", published: true });
  });

  test("rejects missing title", () => {
    expect(() => schema.parse({})).toThrow();
  });

  test("rejects invalid role", () => {
    expect(() => schema.parse({ title: "x", role: "administrator" })).toThrow();
  });

  test("rejects malformed email", () => {
    expect(() => schema.parse({ title: "x", email: "not-an-email" })).toThrow();
  });

  test("rejects malformed url", () => {
    expect(() => schema.parse({ title: "x", url: "not a url" })).toThrow();
  });

  test("published defaults to true", () => {
    const parsed = schema.parse({ title: "x" });
    expect(parsed.published).toBe(true);
  });

  test("published: false is respected", () => {
    const parsed = schema.parse({ title: "x", published: false });
    expect(parsed.published).toBe(false);
  });

  test("passthrough preserves unknown fields", () => {
    const parsed = schema.parse({ title: "x", twitter: "@someone" });
    expect((parsed as { twitter: unknown }).twitter).toBe("@someone");
  });
});
