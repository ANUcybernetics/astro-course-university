import { describe, expect, test } from "vitest";
import { toCourseCollections } from "./collections.js";

describe("toCourseCollections", () => {
  test("passes an explicit list through", () => {
    const list = [{ key: "topics" }, { key: "lectures", dir: "decks", suffix: ".deck.mdx" }];
    expect(toCourseCollections(list)).toBe(list);
  });

  test("normalises a spec object to the list form, keeping dir and suffix only", () => {
    expect(
      toCourseCollections({
        topics: {},
        lectures: { dir: "decks", suffix: ".deck.mdx", collection: false },
      }),
    ).toEqual([{ key: "topics" }, { key: "lectures", dir: "decks", suffix: ".deck.mdx" }]);
  });
});
