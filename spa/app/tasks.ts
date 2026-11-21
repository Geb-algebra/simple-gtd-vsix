import { z } from "zod";

export const categories = ["Next Actions", "Waiting for", "Do at", "Project", "Someday"] as const;
const category = z.enum(categories);
export type Category = z.infer<typeof category>;
const day = z.iso.date();
const name = z.string().trim().min(1);
const id = z.string().min(1);
const task = z
  .object({ id, name })
  .and(
    z.discriminatedUnion("group", [
      z.object({ group: z.literal("Inbox") }),
      z.object({ group: z.literal("Next Actions") }),
      z.object({ group: z.literal("Waiting for"), person: name }),
      z.object({ group: z.literal("Do at"), date: day }),
      z.object({ group: z.literal("Project") }),
      z.object({ group: z.literal("Someday") }),
      z.object({ group: z.literal("Done"), completed: day }),
    ]),
  );
export type Task = z.infer<typeof task>;
const snapshot = z.object({
  tasks: z.array(task),
  deferred: z.array(id),
  deferDay: day,
});
export type Snapshot = z.infer<typeof snapshot>;
const transition = z.object({
  id,
  name,
  from: z.string(),
  to: z.string(),
});
export type Transition = z.infer<typeof transition>;
const entry = z.object({ before: snapshot, after: snapshot, motion: transition.nullable() });
export const stateSchema = snapshot.extend({ undo: z.array(entry), redo: z.array(entry) });
export type State = z.infer<typeof stateSchema>;

export const operationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("add"), name }),
  z.object({ kind: z.literal("rename"), id, name }),
  z.object({
    kind: z.literal("move"),
    id,
    group: category,
    person: name.optional(),
    date: day.optional(),
    before: id.optional(),
    reorder: z.boolean().optional(),
  }),
  z.object({ kind: z.literal("done"), id }),
  z.object({ kind: z.literal("defer"), id }),
  z.object({ kind: z.literal("undo") }),
  z.object({ kind: z.literal("redo") }),
]);
export type Operation = z.infer<typeof operationSchema>;

export function localDay(date = new Date()) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
}

export function nextTasks(state: Snapshot, today: string) {
  const due = state.tasks.filter((item) => item.group === "Do at" && item.date === today);
  const next = state.tasks.filter((item) => item.group === "Next Actions");
  const available = [...due, ...next];
  const deferred = state.deferDay === today ? state.deferred : [];
  return [
    ...available.filter((item) => !deferred.includes(item.id)),
    ...deferred.flatMap((id) => available.filter((item) => item.id === id)),
  ];
}

export function sampleState(today: string): State {
  return {
    tasks: [
      { id: "dentist", group: "Inbox", name: "Book a dentist appointment" },
      { id: "bulb", group: "Inbox", name: "Buy a replacement bulb" },
      { id: "parcel", group: "Do at", name: "Pick up parcel", date: today },
      { id: "notes", group: "Next Actions", name: "Review meeting notes" },
      { id: "delivery", group: "Waiting for", name: "Confirm delivery", person: "David" },
      { id: "office", group: "Project", name: "Organize the home office" },
      { id: "trip", group: "Someday", name: "Plan a weekend trip" },
      { id: "plants", group: "Done", name: "Water the plants", completed: today },
    ],
    deferred: [],
    deferDay: today,
    undo: [],
    redo: [],
  };
}

export function applyOperation(
  state: State,
  operation: Operation,
  today: string,
  newId: () => string,
) {
  const { undo, redo, ...before } = state;
  const { kind } = operation;
  if (kind === "undo" || kind === "redo") {
    const history = kind === "undo" ? undo : redo;
    const entry = history.at(-1);
    if (!entry) return { state, motion: null };
    const motion = entry.motion;
    return kind === "undo"
      ? {
          state: { ...entry.before, undo: undo.slice(0, -1), redo: [...redo, entry] },
          motion: motion && { ...motion, from: motion.to, to: motion.from },
        }
      : { state: { ...entry.after, undo: [...undo, entry], redo: redo.slice(0, -1) }, motion };
  }

  const after = { ...before, tasks: [...before.tasks] };
  let motion: Transition | null = null;
  const inbox =
    kind === "add" || after.tasks.find((item) => item.id === operation.id)?.group === "Inbox";
  if (kind === "add") {
    const item: Task = { id: newId(), name: operation.name, group: "Inbox" };
    after.tasks.push(item);
    motion = { id: item.id, name: item.name, from: "Add", to: "Inbox" };
  } else {
    const index = after.tasks.findIndex((item) => item.id === operation.id);
    const item = after.tasks[index];
    if (!item || item.group === "Done") throw new Error("This task is no longer available.");
    if (kind === "rename") {
      if (operation.name === item.name) return { state, motion: null };
      after.tasks[index] = { ...item, name: operation.name };
    } else if (kind === "defer") {
      if (nextTasks(state, today)[0]?.id !== item.id) throw new Error("The next task has changed.");
      const deferred = before.deferDay === today ? before.deferred : [];
      after.deferred = [...deferred.filter((id) => id !== item.id), item.id];
      after.deferDay = today;
      return {
        state: { ...after, undo, redo },
        motion: { id: item.id, name: item.name, from: "Defer", to: "Defer" },
      };
    } else {
      if (kind === "move" && operation.before === item.id) return { state, motion: null };
      const updated = task.parse(
        kind === "done"
          ? { id: item.id, name: item.name, group: "Done", completed: today }
          : {
              id: item.id,
              name: item.name,
              group: operation.group,
              person: operation.person,
              date: operation.date,
            },
      );
      if (
        kind === "move" &&
        updated.group === item.group &&
        !operation.reorder &&
        !operation.before
      ) {
        after.tasks[index] = updated;
      } else {
        after.tasks.splice(index, 1);
        const insertion =
          kind === "move"
            ? after.tasks.findIndex(
                (candidate) =>
                  candidate.id === operation.before && candidate.group === updated.group,
              )
            : -1;
        after.tasks.splice(insertion < 0 ? after.tasks.length : insertion, 0, updated);
      }
      if (item.group !== updated.group) {
        after.deferred = after.deferred.filter((id) => id !== item.id);
        motion = { id: item.id, name: item.name, from: item.group, to: updated.group };
      }
    }
  }

  return {
    state: {
      ...after,
      undo: inbox ? [...undo, { before, after, motion }].slice(-50) : [],
      redo: [],
    },
    motion,
  };
}
