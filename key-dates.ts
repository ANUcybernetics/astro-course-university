import type { ContentNode, CourseMeta } from "./course-graph.js";

export interface KeyDatesOptions {
  /** IANA zone the frontmatter dates are local to; times print in it. */
  timezone?: string;
  /** The course record, for the teaching start and end dates. */
  course?: Pick<CourseMeta, "startDate" | "endDate">;
  /** Locale for the printed dates (default "en-AU"). */
  locale?: string;
}

const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Every node with a `due` date as a markdown "Key dates" block, soonest
 * first, carrying its `weight` and `week` where it has them — the facts an
 * agent is asked most, in one place. Meant for the theme's
 * `llmsTxt: { extra }`, so the block comes from the same frontmatter the
 * pages render rather than a hand-written restatement. Links are
 * root-relative node URLs, which the theme absolutises. Returns undefined
 * when nothing is due, so the section is simply absent.
 */
export function keyDatesMarkdown(
  nodes: ContentNode[],
  options: KeyDatesOptions = {},
): string | undefined {
  const { timezone, course, locale = "en-AU" } = options;
  const dated = nodes
    .flatMap((node) => {
      const due = node.meta.due;
      const when = typeof due === "string" ? due : due instanceof Date ? due.toISOString() : null;
      return when ? [{ node, when }] : [];
    })
    .toSorted((a, b) => Date.parse(a.when) - Date.parse(b.when));
  if (dated.length === 0) return undefined;

  const dayIn = (timeZone: string | undefined) =>
    new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone,
    });
  const day = dayIn(timezone);
  // A bare date names a calendar day, so it is read and printed in UTC: in
  // the site zone, UTC midnight lands on the previous day west of Greenwich.
  const calendarDay = dayIn("UTC");
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  });
  const format = (when: string) => {
    // A bare date is a calendar day, not an instant: print it as such.
    if (BARE_DATE.test(when)) return calendarDay.format(new Date(`${when}T00:00:00Z`));
    const instant = new Date(when);
    return `${day.format(instant)}, ${time.format(instant)}`;
  };

  const lines = ["## Key dates", ""];
  if (timezone) lines.push(`Times are local to ${timezone}.`, "");
  if (course) {
    lines.push(`- teaching runs ${format(course.startDate)} to ${format(course.endDate)}`);
  }
  for (const { node, when } of dated) {
    const facts = [
      typeof node.meta.weight === "number" ? `${node.meta.weight}%` : null,
      typeof node.meta.week === "number" ? `week ${node.meta.week}` : null,
    ].filter(Boolean);
    const suffix = facts.length > 0 ? ` (${facts.join(", ")})` : "";
    lines.push(`- [${node.title}](/${node.id}/) due ${format(when)}${suffix}`);
  }
  return lines.join("\n");
}
