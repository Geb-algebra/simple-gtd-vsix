import { describe, expect, it, vi } from "vitest";
import { initialMarkdown, type Markdown } from "../../extension/markdown";
import { saveMarkdown, type MarkdownStorage } from "../../extension/storage";

const before = { ...initialMarkdown, "inbox.md": "- Finish\n" };
const after = { ...before, "inbox.md": "", "log.md": "# log\n\n## 261121\n\n- Finish\n" };

function storageFor(disk: Markdown) {
  const write = vi.fn<MarkdownStorage["write"]>(async (file, value) => {
    disk[file] = value;
  });
  return {
    read: async (file) => disk[file],
    write,
    isDirty: () => false,
  } satisfies MarkdownStorage;
}

describe("Markdown saving", () => {
  it("rejects changes based on a stale file before writing anything", async () => {
    const disk = { ...before, "inbox.md": before["inbox.md"] + "- External\n" };
    const storage = storageFor(disk);
    await expect(saveMarkdown(storage, before, after)).rejects.toThrow("inbox.md changed");
    expect(storage.write).not.toHaveBeenCalled();
  });

  it("restores the Inbox if writing the completion log fails", async () => {
    const disk = { ...before };
    const storage = storageFor(disk);
    storage.write.mockImplementationOnce(async (file, value) => {
      disk[file] = value;
    });
    storage.write.mockRejectedValueOnce(new Error("Disk unavailable"));
    await expect(saveMarkdown(storage, before, after)).rejects.toThrow("Disk unavailable");
    expect(disk).toEqual(before);
  });

  it("reports the file when an external edit prevents restoration", async () => {
    const disk = { ...before };
    const storage = storageFor(disk);
    storage.write.mockImplementationOnce(async (file, value) => {
      disk[file] = value;
    });
    storage.write.mockImplementationOnce(async () => {
      disk["inbox.md"] = "- New external edit\n";
      throw new Error("Disk unavailable");
    });
    await expect(saveMarkdown(storage, before, after)).rejects.toThrow(
      "Could not restore inbox.md",
    );
    expect(disk["inbox.md"]).toBe("- New external edit\n");
  });
});
