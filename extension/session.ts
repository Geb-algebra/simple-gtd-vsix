import { randomUUID } from "node:crypto";
import { applyOperation, type Operation, type State } from "../spa/app/tasks";
import { editMarkdown, files, readTasks, type Markdown } from "./markdown";

export function sameMarkdown(a: Markdown, b: Markdown) {
  return files.every((file) => a[file] === b[file]);
}

type Changes = { before: Markdown; after: Markdown };

export class WorkspaceSession {
  revision = randomUUID();
  state: State;
  private undo: Changes[] = [];
  private redo: Changes[] = [];

  constructor(public markdown: Markdown) {
    this.state = readTasks(markdown);
  }

  async change(
    operation: Operation,
    today: string,
    save: (next: Markdown) => Promise<void>,
    project: (name: string) => Promise<void>,
  ) {
    const current = this.state;
    const previous = this.markdown;
    let next: Markdown;
    let result;
    let undo = this.undo;
    let redo = this.redo;
    let createdProject = false;

    if (operation.kind === "move" && operation.group === "Project") {
      const task = current.tasks.find((item) => item.id === operation.id && item.group === "Inbox");
      if (!task) throw new Error("This Inbox task is no longer available.");
      const state = {
        ...current,
        tasks: current.tasks.filter((item) => item.id !== task.id),
        undo: [],
        redo: [],
      };
      next = editMarkdown(previous, current.tasks, state.tasks);
      await project(task.name);
      createdProject = true;
      result = { state, motion: null };
      undo = [];
      redo = [];
    } else {
      result = applyOperation(current, operation, today, randomUUID);
      if (result.state === current) return result.motion;
      if (operation.kind === "undo") {
        const entry = undo.at(-1)!;
        next = entry.before;
        undo = undo.slice(0, -1);
        redo = [...redo, entry];
      } else if (operation.kind === "redo") {
        const entry = redo.at(-1)!;
        next = entry.after;
        redo = redo.slice(0, -1);
        undo = [...undo, entry];
      } else if (operation.kind === "defer") {
        next = previous;
        // A later Inbox undo must preserve a change to the current day's order.
        const deferred = { deferred: result.state.deferred, deferDay: result.state.deferDay };
        const preserveOrder = (entry: State["undo"][number]) => ({
          ...entry,
          before: { ...entry.before, ...deferred },
          after: { ...entry.after, ...deferred },
        });
        result.state.undo = current.undo.map(preserveOrder);
        result.state.redo = current.redo.map(preserveOrder);
      } else {
        next = editMarkdown(previous, current.tasks, result.state.tasks);
        undo = result.state.undo.length
          ? [...undo, { before: previous, after: next }].slice(-50)
          : [];
        redo = [];
      }
    }

    try {
      await save(next);
    } catch (error) {
      if (createdProject) {
        throw new Error(
          `Project command ran, but the Inbox could not be updated. Check the project before retrying. ${error instanceof Error ? error.message : error}`,
        );
      }
      throw error;
    }
    this.markdown = next;
    this.state = result.state;
    this.undo = undo;
    this.redo = redo;
    this.revision = randomUUID();
    return result.motion;
  }
}
