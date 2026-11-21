import { describe, expect, it } from "vitest";
import {
  applyOperation,
  nextTasks,
  operationSchema,
  sampleState,
  stateSchema,
  type Operation,
  type State,
} from "./tasks";

const today = "2026-11-21";
const apply = (state: State, operation: Operation) =>
  applyOperation(state, operation, today, () => "new");

describe("Inbox history", () => {
  it("adds at the end and replays the movement in both directions", () => {
    const start = sampleState(today);
    const added = apply(start, { kind: "add", name: "Pick up groceries" });
    expect(
      added.state.tasks.filter((task) => task.group === "Inbox").map((task) => task.id),
    ).toEqual(["dentist", "bulb", "new"]);
    const undone = apply(added.state, { kind: "undo" });
    expect(undone.state.tasks).toEqual(start.tasks);
    expect(undone.motion).toMatchObject({ from: "Inbox", to: "Add" });
    const redone = apply(undone.state, { kind: "redo" });
    expect(redone.state.tasks).toEqual(added.state.tasks);
    expect(redone.motion).toEqual(added.motion);
    expect(stateSchema.parse(redone.state)).toEqual(redone.state);
  });

  it("restores original order when undoing a completion", () => {
    const start = sampleState(today);
    const completed = apply(start, { kind: "done", id: "dentist" });
    expect(completed.state.tasks.at(-1)).toMatchObject({
      id: "dentist",
      group: "Done",
      completed: today,
    });
    expect(apply(completed.state, { kind: "undo" }).state.tasks).toEqual(start.tasks);
  });

  it("clears Inbox history after changing a classified task", () => {
    const { state } = apply(sampleState(today), { kind: "move", id: "dentist", group: "Project" });
    const moved = apply(state, {
      kind: "move",
      id: "dentist",
      group: "Waiting for",
      person: "Sam",
    });
    expect(moved.state.tasks.at(-1)).toMatchObject({ group: "Waiting for", person: "Sam" });
    expect(moved.state.undo).toEqual([]);
  });
});

describe("Task order and validation", () => {
  it("prioritizes today's scheduled work and resets deferral on the next day", () => {
    const start = sampleState(today);
    expect(nextTasks(start, today).map((task) => task.id)).toEqual(["parcel", "notes"]);
    const { state } = apply(start, { kind: "defer", id: "parcel" });
    expect(nextTasks(state, today).map((task) => task.id)).toEqual(["notes", "parcel"]);
    expect(nextTasks(state, "2026-11-22").map((task) => task.id)).toEqual(["notes"]);
  });

  it("distinguishes editing a date from reordering a scheduled task", () => {
    const start = sampleState(today);
    start.tasks.push({ id: "permit", name: "Renew permit", group: "Do at", date: today });
    const edit = { kind: "move", id: "parcel", group: "Do at", date: today } as const;
    expect(nextTasks(apply(start, edit).state, today).map((task) => task.id)).toEqual([
      "parcel",
      "permit",
      "notes",
    ]);
    expect(
      nextTasks(apply(start, { ...edit, reorder: true }).state, today).map((task) => task.id),
    ).toEqual(["permit", "parcel", "notes"]);
  });

  it("rejects blank names, impossible dates and missing category attributes", () => {
    expect(operationSchema.safeParse({ kind: "add", name: "   " }).success).toBe(false);
    expect(
      operationSchema.safeParse({ kind: "move", id: "parcel", group: "Do at", date: "2026-02-30" })
        .success,
    ).toBe(false);
    expect(() =>
      apply(sampleState(today), { kind: "move", id: "dentist", group: "Waiting for" }),
    ).toThrow();
  });
});
