import { describe, expect, it, vi } from "vitest";
import { initialMarkdown, type Markdown } from "../../extension/markdown";
import { WorkspaceSession } from "../../extension/session";
import { nextTasks, type Operation } from "./tasks";

const today = "2026-11-21";
const original: Markdown = {
  ...initialMarkdown,
  "inbox.md": "\uFEFF<!-- note -->\r\n* Same\r\n- Same\r\n",
  "tasks.md":
    "## Next Actions\n\n- Second\n\n## Do at\n\n- First @2026-11-21\n\n## Unmanaged\n- Leave it\n",
  "log.md": "# log\n\n## 261120\n\n- Earlier\n",
};

function setup() {
  const session = new WorkspaceSession(original);
  const save = vi.fn<(markdown: Markdown) => Promise<void>>().mockResolvedValue(undefined);
  const project = vi.fn<(name: string) => Promise<void>>().mockResolvedValue(undefined);
  return {
    session,
    save,
    project,
    change: (operation: Operation) => session.change(operation, today, save, project),
  };
}

describe("VS Code workspace session", () => {
  it("moves and completes the correct duplicate, and restores exact file contents on undo", async () => {
    const { session, change } = setup();
    const first = session.state.tasks[0].id;
    const second = session.state.tasks[1].id;
    await change({ kind: "move", id: first, group: "Waiting for", person: "David" });
    const moved = session.markdown;
    expect(moved["inbox.md"]).toBe("\uFEFF<!-- note -->\r\n- Same\r\n");
    expect(moved["tasks.md"]).toContain("- Same @David");
    expect(moved["tasks.md"]).toContain("## Unmanaged\n- Leave it");
    await change({ kind: "done", id: second });
    expect(session.markdown["log.md"]).toMatch(/## 261121\n\n- Same[\s\S]+## 261120/);
    await change({ kind: "undo" });
    expect(session.markdown).toEqual(moved);
    await change({ kind: "undo" });
    expect(session.markdown).toEqual(original);
    await change({ kind: "redo" });
    expect(session.markdown).toEqual(moved);
  });

  it("preserves attributes while editing, reorders tasks, and defers only today's display order", async () => {
    const { session, change } = setup();
    const [due, next] = nextTasks(session.state, today);
    await change({ kind: "rename", id: due.id, name: "Renamed" });
    expect(session.markdown["tasks.md"]).toContain("- Renamed @2026-11-21");
    await change({ kind: "move", id: due.id, group: "Next Actions", before: next.id });
    expect(session.markdown["tasks.md"]).toContain("- Renamed\n- Second");
    const classified = session.markdown;
    await change({ kind: "defer", id: due.id });
    expect(session.markdown).toEqual(classified);
    expect(nextTasks(session.state, today).map((task) => task.name)).toEqual(["Second", "Renamed"]);
    expect(nextTasks(session.state, "2026-11-22").map((task) => task.name)).toEqual([
      "Renamed",
      "Second",
    ]);
  });

  it("moves the Inbox item into Project only after command and save success", async () => {
    const { session, change, save, project } = setup();
    const operation = { kind: "move", id: session.state.tasks[0].id, group: "Project" } as const;
    const revision = session.revision;
    project.mockRejectedValueOnce(new Error("Not configured"));
    await expect(change(operation)).rejects.toThrow("Not configured");
    expect(save).not.toHaveBeenCalled();
    save.mockRejectedValueOnce(new Error("Conflict"));
    await expect(change(operation)).rejects.toThrow("Project command ran");
    expect(session.markdown).toEqual(original);
    expect(session.revision).toBe(revision);
    await expect(change(operation)).resolves.toMatchObject({ from: "Inbox", to: "Project" });
    expect(project).toHaveBeenLastCalledWith("Same");
    expect(session.markdown["inbox.md"]).toBe("\uFEFF<!-- note -->\r\n- Same\r\n");
    await change({ kind: "undo" });
    expect(session.state.tasks.find((task) => task.id === operation.id)?.group).toBe("Project");
    expect(new WorkspaceSession(session.markdown).state.tasks).toContainEqual(
      expect.objectContaining({ name: "Same", group: "Project" }),
    );
  });
});
