import { describe, expect, test } from "vitest";
import type { ContentNode } from "./course-graph.js";
import { keyDatesMarkdown } from "./key-dates.js";

function node(id: string, title: string, meta: Record<string, unknown>): ContentNode {
  const [type, slug] = id.split("/");
  return { id, type, slug, title, tags: [], related: [], links: [], spec: [], meta, body: "" };
}

describe("keyDatesMarkdown", () => {
  const nodes = [
    node("assessments/final", "Final project", {
      due: "2026-11-09T12:00:00+11:00",
      weight: 40,
      week: 12,
    }),
    node("assessments/a1", "Assignment 1", { due: "2026-08-17T12:00:00+10:00", weight: 20 }),
    node("topics/intro", "Intro", { week: 1 }),
  ];

  test("lists dated nodes soonest first, with weight and week", () => {
    const md = keyDatesMarkdown(nodes, { timezone: "Australia/Canberra" })!;
    expect(md).toContain("## Key dates");
    expect(md).toContain("Times are local to Australia/Canberra.");
    expect(md.indexOf("Assignment 1")).toBeLessThan(md.indexOf("Final project"));
    expect(md).toContain("- [Assignment 1](/assessments/a1/) due Mon, 17 Aug 2026, 12:00 (20%)");
    expect(md).toContain(
      "- [Final project](/assessments/final/) due Mon, 9 Nov 2026, 12:00 (40%, week 12)",
    );
    expect(md).not.toContain("Intro");
  });

  test("prints a bare date as a calendar day and adds the teaching span", () => {
    const md = keyDatesMarkdown([node("labs/x", "X", { due: "2026-03-02" })], {
      timezone: "America/Los_Angeles",
      course: { startDate: "2026-02-23", endDate: "2026-06-05" },
    })!;
    expect(md).toContain("- teaching runs Mon, 23 Feb 2026 to Fri, 5 June 2026");
    expect(md).toContain("- [X](/labs/x/) due Mon, 2 Mar 2026");
  });

  test("returns undefined when nothing is due", () => {
    expect(keyDatesMarkdown([node("topics/a", "A", {})])).toBeUndefined();
  });
});
