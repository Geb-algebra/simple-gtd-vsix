import { describe, expect, it } from "vitest";
import { appendInbox, initialMarkdown, readTasks } from "../../extension/markdown";

describe("workspace Markdown", () => {
  it("reads the three files as plain lists in file order", () => {
    const state = readTasks(
      {
        "inbox.md": "- Same\n- Same\n- [ ] Checkbox\n",
        "tasks.md":
          "## Do at\n- Today @2026-11-21\n- Timed @2026-11-21T10:00:00\n\n## Waiting for\n- Reply @David\n",
        "log.md": "# Log\n\n## 261120\n- Done\n",
      },
      "2026-11-21",
    );
    expect(state.tasks).toEqual([
      { id: "inbox.md:0", name: "Same", group: "Inbox" },
      { id: "inbox.md:1", name: "Same", group: "Inbox" },
      { id: "tasks.md:1", name: "Today", date: "2026-11-21", group: "Do at" },
      { id: "tasks.md:5", name: "Reply", person: "David", group: "Waiting for" },
      { id: "log.md:3", name: "Done", completed: "2026-11-20", group: "Done" },
    ]);
  });

  it("appends a single task without rewriting the previous content", () => {
    const source = "<!-- note -->\r\n- Previous";
    const inbox = appendInbox(source, "New");
    expect(inbox).toBe(source + "\r\n- New\r\n");
    expect(
      readTasks({ ...initialMarkdown, "inbox.md": inbox }).tasks.map((task) => task.name),
    ).toEqual(["Previous", "New"]);
  });
});
