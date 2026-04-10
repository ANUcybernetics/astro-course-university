import { describe, expect, test } from "vitest";
import { assembleTopics, parseTopicDirective } from "./topic-assembler.js";

function normalize(s: string): string {
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

describe("parseTopicDirective", () => {
  test("returns slug for a standard topic comment", () => {
    expect(parseTopicDirective("<!-- topic: variables -->")).toBe("variables");
  });

  test("returns slug with extra internal whitespace", () => {
    expect(parseTopicDirective("<!--  topic:  variables  -->")).toBe("variables");
  });

  test("returns slug when comment has surrounding whitespace", () => {
    expect(parseTopicDirective("  <!-- topic: variables -->  ")).toBe("variables");
  });

  test("returns null for non-comment HTML", () => {
    expect(parseTopicDirective("<div>hello</div>")).toBeNull();
  });

  test("returns null for comments without topic prefix", () => {
    expect(parseTopicDirective("<!-- _class: impact -->")).toBeNull();
    expect(parseTopicDirective("<!-- notes: remember this -->")).toBeNull();
  });

  test("returns null for empty topic slug", () => {
    expect(parseTopicDirective("<!-- topic: -->")).toBeNull();
    expect(parseTopicDirective("<!-- topic:  -->")).toBeNull();
  });

  test("captures only the first word as slug", () => {
    expect(parseTopicDirective("<!-- topic: foo bar -->")).toBe("foo");
  });

  test("returns null for incomplete comment delimiters", () => {
    expect(parseTopicDirective("<!-- topic: foo")).toBeNull();
    expect(parseTopicDirective("topic: foo -->")).toBeNull();
  });
});

describe("assembleTopics", () => {
  test("passes through content with no markers", () => {
    const source = "# Title\n\nSome content.\n";
    const { markdown, warnings } = assembleTopics(source, {});
    expect(normalize(markdown)).toBe(normalize(source));
    expect(warnings).toEqual([]);
  });

  test("replaces a single topic marker", () => {
    const source = "# Lecture\n\n<!-- topic: variables -->\n\n## After\n";
    const topics = {
      variables: "## What is a variable?\n\nA name bound to a value.\n",
    };

    const { markdown, warnings } = assembleTopics(source, topics);
    expect(warnings).toEqual([]);
    expect(normalize(markdown)).toBe(
      normalize("# Lecture\n\n## What is a variable?\n\nA name bound to a value.\n\n## After\n"),
    );
  });

  test("replaces multiple topic markers in order", () => {
    const source = "# Lecture\n\n<!-- topic: a -->\n\n---\n\n<!-- topic: b -->\n";
    const topics = {
      a: "## Topic A\n\nContent A.\n",
      b: "## Topic B\n\nContent B.\n",
    };

    const { markdown, warnings } = assembleTopics(source, topics);
    expect(warnings).toEqual([]);
    const result = normalize(markdown);
    expect(result).toContain("## Topic A");
    expect(result).toContain("## Topic B");
    expect(result.indexOf("Topic A")).toBeLessThan(result.indexOf("Topic B"));
  });

  test("interleaves topic content with lecture content", () => {
    const source =
      "# Intro\n\n## Announcements\n\nHello.\n\n<!-- topic: func -->\n\n## Recap\n\nThat was functions.\n";
    const topics = {
      func: "## Functions\n\nA function is...\n",
    };

    const { markdown, warnings } = assembleTopics(source, topics);
    expect(warnings).toEqual([]);
    const result = normalize(markdown);
    expect(result.indexOf("Announcements")).toBeLessThan(result.indexOf("Functions"));
    expect(result.indexOf("Functions")).toBeLessThan(result.indexOf("Recap"));
  });

  test("warns on missing topic and leaves marker removed", () => {
    const source = "# Lecture\n\n<!-- topic: nonexistent -->\n\n## After\n";
    const { markdown, warnings } = assembleTopics(source, {});
    expect(warnings).toEqual(["Topic not found: nonexistent"]);
    expect(normalize(markdown)).toContain("## After");
  });

  test("handles empty topic content", () => {
    const source = "# Lecture\n\n<!-- topic: empty -->\n\n## After\n";
    const topics = { empty: "" };

    const { markdown, warnings } = assembleTopics(source, topics);
    expect(warnings).toEqual([]);
    expect(normalize(markdown)).toContain("## After");
  });

  test("handles topic marker with extra whitespace", () => {
    const source = "# Lecture\n\n<!--  topic:  variables  -->\n";
    const topics = {
      variables: "## Variables\n\nContent.\n",
    };

    const { markdown, warnings } = assembleTopics(source, topics);
    expect(warnings).toEqual([]);
    expect(normalize(markdown)).toContain("## Variables");
  });

  test("ignores non-topic HTML comments", () => {
    const source =
      "# Lecture\n\n<!-- _class: impact -->\n\n<!-- notes: remember this -->\n\n<!-- topic: a -->\n";
    const topics = { a: "## Topic A\n" };

    const { markdown, warnings } = assembleTopics(source, topics);
    expect(warnings).toEqual([]);
    const result = normalize(markdown);
    expect(result).toContain("<!-- _class: impact -->");
    expect(result).toContain("<!-- notes: remember this -->");
    expect(result).toContain("## Topic A");
  });

  test("splices multi-slide topic content", () => {
    const source = "# Lecture\n\n<!-- topic: big -->\n";
    const topics = {
      big: "## Slide 1\n\nFirst.\n\n---\n\n## Slide 2\n\nSecond.\n\n---\n\n## Slide 3\n\nThird.\n",
    };

    const { markdown, warnings } = assembleTopics(source, topics);
    expect(warnings).toEqual([]);
    const result = normalize(markdown);
    expect(result).toContain("## Slide 1");
    expect(result).toContain("## Slide 2");
    expect(result).toContain("## Slide 3");
  });

  test("preserves source frontmatter", () => {
    const source = "---\ntitle: My Deck\nauthor: Test\n---\n\n# Slide 1\n\n<!-- topic: a -->\n";
    const topics = { a: "## Included\n" };

    const { markdown, warnings } = assembleTopics(source, topics);
    expect(warnings).toEqual([]);
    const result = normalize(markdown);
    expect(result).toContain("---\ntitle: My Deck\nauthor: Test\n---");
    expect(result).toContain("## Included");
  });

  test("strips frontmatter from topic files", () => {
    const source = "# Lecture\n\n<!-- topic: a -->\n";
    const topics = {
      a: "---\ntitle: Topic A\nkind: concept\n---\n\n## Topic content\n\nBody text.\n",
    };

    const { markdown, warnings } = assembleTopics(source, topics);
    expect(warnings).toEqual([]);
    const result = normalize(markdown);
    expect(result).toContain("## Topic content");
    expect(result).toContain("Body text.");
    expect(result).not.toContain("kind: concept");
    expect(result).not.toContain("title: Topic A");
  });
});
