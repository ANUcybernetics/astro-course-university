import { test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export const fsTest = test.extend<{ tmpDir: string }>({
  // eslint-disable-next-line no-empty-pattern -- vitest fixtures require a destructured first arg
  tmpDir: async ({}, use) => {
    const dir = await mkdtemp(join(tmpdir(), "anu-course-test-"));
    await use(dir);
    await rm(dir, { recursive: true });
  },
});
