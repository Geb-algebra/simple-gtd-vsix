import { files, type Markdown, type MarkdownFile } from "./markdown";

export type MarkdownStorage = {
  read(file: MarkdownFile): Promise<string>;
  write(file: MarkdownFile, value: string): Promise<void>;
  isDirty(file: MarkdownFile): boolean;
};

async function matches(storage: MarkdownStorage, file: MarkdownFile, expected: string) {
  const actual = await storage.read(file);
  return !storage.isDirty(file) && actual === expected;
}

export async function verifyUnchanged(storage: MarkdownStorage, expected: Markdown) {
  for (const file of files) {
    if (!(await matches(storage, file, expected[file]))) {
      throw new Error(`${file} changed. Save your edits and try again.`);
    }
  }
}

export async function saveMarkdown(storage: MarkdownStorage, before: Markdown, after: Markdown) {
  await verifyUnchanged(storage, before);
  const written: MarkdownFile[] = [];
  try {
    for (const file of files) {
      if (before[file] === after[file]) continue;
      if (!(await matches(storage, file, before[file]))) {
        throw new Error(`${file} changed during the update.`);
      }
      written.push(file);
      await storage.write(file, after[file]);
    }
    await verifyUnchanged(storage, after);
  } catch (error) {
    const unresolved: MarkdownFile[] = [];
    for (const file of written.reverse()) {
      try {
        const actual = await storage.read(file);
        if (actual === before[file]) continue;
        if (storage.isDirty(file) || actual !== after[file]) {
          unresolved.push(file);
          continue;
        }
        await storage.write(file, before[file]);
      } catch {
        unresolved.push(file);
      }
    }
    if (unresolved.length) {
      throw new Error(
        `Could not restore ${unresolved.join(", ")} after a failed save. Review the refreshed files.`,
      );
    }
    throw error;
  }
}
