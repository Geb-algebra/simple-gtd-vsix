import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { Link, data, useFetcher, useLocation } from "react-router";
import { ArrowLeft, ChevronDown, CircleCheck, Inbox, ListTodo, Plus, Redo } from "lucide-react";
import { z } from "zod";
import type { Route } from "./+types/workspace";
import { loadWorkspace, changeWorkspace } from "./storage.client";
import {
  categories,
  localDay,
  nextTasks,
  operationSchema,
  type Category,
  type Task,
  type State,
} from "./tasks";
import { ButtonTooltip } from "./components/ui/tooltip";
import { Checkbox } from "./components/ui/checkbox";
import { Input } from "./components/ui/input";
import { cn } from "./components/ui/utils";
import {
  cardClass,
  FlightCard,
  iconClass,
  IconButton,
  TaskCard,
  type Edit,
  type Submit,
} from "./task-card";
import { Flight, reducedMotion, type Motion } from "./motion";
import { Log } from "./log";
import styles from "./workspace.module.css";

export function meta() {
  return [{ title: "Simple GTD" }];
}

const screen = z.enum(["tasks", "next", "log"]).optional();

export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  if (!screen.safeParse(params.screen).success) throw data("Page not found", { status: 404 });
  return loadWorkspace();
}

export async function clientAction({ request }: Route.ClientActionArgs) {
  try {
    const operation = operationSchema.parse(await request.json());
    return { error: "", transition: await changeWorkspace(operation) };
  } catch (error) {
    console.error(error);
    return {
      error: "Could not save the change. Check the task details and try again.",
      transition: null,
    };
  }
}

export type Panel = "Inbox" | "TODOs" | "TADAs";
const panels = {
  Inbox: { url: "/", Icon: Inbox },
  TODOs: { url: "/next", Icon: ListTodo },
  TADAs: { url: "/log", Icon: CircleCheck },
} satisfies Record<Panel, { url: string; Icon: typeof Inbox }>;
const dragType = "application/x-simple-gtd-task";

const panelSurface = "rounded-xl border border-line";

const panelOrder = ["Inbox", "TODOs", "TADAs"] as const;

function StackPreview({
  tasks,
  empty,
  arrivingId,
}: {
  tasks: Task[];
  empty: string;
  arrivingId?: string;
}) {
  const head = tasks[0];
  return (
    <div className={styles.panelPreview} aria-hidden="true">
      <div className={styles.stack} data-depth={Math.min(3, tasks.length)}>
        {head ? (
          <div className={head.id === arrivingId ? "invisible" : undefined}>
            <FlightCard name={head.name} checked={false} />
          </div>
        ) : (
          <p className={`${styles.empty} text-muted`}>{empty}</p>
        )}
      </div>
    </div>
  );
}

function CollapsedPanel({ panel, children }: { panel: Panel; children: React.ReactNode }) {
  const { url, Icon } = panels[panel];
  return (
    <section
      data-panel={panel}
      className={`${styles.collapsedPanel} ${panelSurface} hover:bg-panel hover:shadow-lg motion-safe:transition-[background-color,box-shadow] motion-safe:duration-200`}
    >
      <Link to={url} className={`${styles.collapsedHeading} text-xl font-bold`}>
        <Icon size={21} aria-hidden="true" />
        <span>{panel}</span>
      </Link>
      {children}
    </section>
  );
}

function taskPanel(group: string): Panel {
  if (group === "Inbox" || group === "Add") return "Inbox";
  return group === "Done" ? "TADAs" : "TODOs";
}

function AddTask({
  open,
  setOpen,
  disabled,
  submit,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  disabled: boolean;
  submit: Submit;
}) {
  const origin = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [hasName, setHasName] = useState(false);
  const cancelled = useRef(false);
  function finish() {
    if (!input.current || cancelled.current) return;
    cancelled.current = true;
    const name = input.current.value.trim();
    if (name) submit({ kind: "add", name }, origin.current ?? undefined);
    setOpen(false);
  }
  return (
    <div className={styles.addArea} data-motion="Add">
      {open ? (
        <form
          ref={origin}
          className={`${cardClass} ${styles.addForm}`}
          onSubmit={(event) => {
            event.preventDefault();
            finish();
          }}
        >
          <span className={styles.handle} />
          <Checkbox disabled aria-label="Complete new task" className={styles.check} />
          <Input
            ref={(element) => {
              input.current = element;
              if (element) element.focus();
            }}
            aria-label="New task name"
            placeholder="Task name"
            className={`${styles.taskName} ${styles.titleInput}`}
            onChange={(event) => setHasName(Boolean(event.currentTarget.value.trim()))}
            onBlur={finish}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                cancelled.current = true;
                setOpen(false);
              }
            }}
          />
          <span className={`${styles.addHint} text-muted`}>{hasName && "Press Enter to add"}</span>
        </form>
      ) : (
        <ButtonTooltip label="Add task">
          <button
            type="button"
            disabled={disabled}
            aria-label="Add task"
            className={`${styles.addButton} rounded-lg border border-dashed border-line bg-transparent hover:bg-panel focus-visible:outline-2`}
            onClick={() => {
              cancelled.current = false;
              setHasName(false);
              setOpen(true);
            }}
          >
            <Plus size={21} />
          </button>
        </ButtonTooltip>
      )}
      <ChevronDown className={styles.chevron} size={17} aria-hidden="true" />
    </div>
  );
}

export default function WorkspaceRoute({ loaderData, params }: Route.ComponentProps) {
  return <Workspace state={loaderData} screen={params.screen} />;
}

export function Workspace({
  state,
  screen,
  revision,
}: {
  state: State;
  screen?: string;
  revision?: string;
}) {
  const location = useLocation();
  const panel: Panel = screen === "log" ? "TADAs" : screen === undefined ? "Inbox" : "TODOs";
  const all = screen === "tasks";
  const [today, setToday] = useState(localDay);
  const [edit, setEdit] = useState<Edit>();
  const [adding, setAdding] = useState(false);
  const [completing, setCompleting] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [motion, setMotion] = useState<Motion>();
  const [arrivedToken, setArrivedToken] = useState<number>();
  const arrivingId = motion && motion.token !== arrivedToken ? motion.transition.id : undefined;
  const fetcher = useFetcher<typeof clientAction>();
  const change = useRef<{ source?: DOMRect } | undefined>(undefined);
  const locking = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const token = useRef(0);
  const inbox = state.tasks.filter((task) => task.group === "Inbox");
  const next = nextTasks(state, today);
  const stack = panel === "Inbox" ? inbox : next;
  const head = stack[0];
  const disabled = busy || fetcher.state !== "idle";

  useEffect(() => {
    const refresh = () => setToday(localDay());
    const interval = setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    setEdit(undefined);
    setAdding(false);
  }, [location.pathname]);

  function position(value: string, id?: string) {
    const task = id && document.querySelector(`[data-task="${CSS.escape(id)}"]`);
    if (task) return task.getBoundingClientRect();
    const target = taskPanel(value);
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-motion]"));
    const node =
      nodes.find((el) => el.dataset.motion === value) ??
      (target === "TODOs" ? nodes.find((el) => el.dataset.motion === "Defer") : undefined) ??
      document.querySelector(`[data-panel="${target}"]`);
    return node?.getBoundingClientRect();
  }

  useLayoutEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data || !change.current) return;
    const { source } = change.current;
    const transition = fetcher.data.transition;
    change.current = undefined;
    locking.current = false;
    setBusy(false);
    setCompleting(undefined);
    if (!transition || reducedMotion()) return;
    const origin = source ?? position(transition.from);
    const sourcePanel = taskPanel(transition.from);
    const destinationPanel = taskPanel(transition.to);
    const impact =
      sourcePanel !== destinationPanel
        ? document.querySelector<HTMLElement>(`[data-panel="${destinationPanel}"]`)
        : null;
    const target = impact?.getBoundingClientRect() ?? position(transition.to);
    const card = document.querySelector<HTMLElement>("[data-task]")?.getBoundingClientRect();
    const width = card?.width ?? target?.width ?? 512;
    const height = card?.height ?? 56;
    const start =
      origin && (origin.width > 512 || origin.width < 200 || origin.height > 100)
        ? new DOMRect(
            origin.left + (origin.width - Math.min(512, width)) / 2,
            origin.top + (origin.height - height) / 2,
            Math.min(512, width),
            height,
          )
        : origin;
    const end = target ?? start;
    const key = ++token.current;
    if (start && end) setMotion({ start, end, impact, transition, token: key });
  }, [fetcher.data, fetcher.state]);

  const submit: Submit = (operation, element) => {
    if (locking.current) return;
    locking.current = true;
    setBusy(true);
    const task =
      "id" in operation ? state.tasks.find((task) => task.id === operation.id) : undefined;
    const history =
      operation.kind === "undo"
        ? state.undo.at(-1)?.motion
        : operation.kind === "redo"
          ? state.redo.at(-1)?.motion
          : undefined;
    const source =
      element?.getBoundingClientRect() ??
      (task && position(task.group, task.id)) ??
      (history ? position(operation.kind === "undo" ? history.to : history.from) : undefined);
    change.current = { source };
    const send = () =>
      fetcher.submit(revision === undefined ? operation : { operation, revision, today }, {
        method: "post",
        encType: "application/json",
        action: location.pathname,
      });
    if (operation.kind === "done" && !reducedMotion()) {
      setCompleting(operation.id);
      timer.current = setTimeout(send, 125);
    } else void send();
  };

  function routeInbox(group: Category) {
    if (!head) return;
    if (group === "Waiting for" || group === "Do at") setEdit({ id: head.id, group });
    else submit({ kind: "move", id: head.id, group });
  }

  useEffect(() => {
    if (panel !== "Inbox") return;
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.altKey || disabled || adding || edit)
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.closest("input, textarea, [contenteditable]") ||
          (target.closest("button, a") && event.key === "Enter"))
      )
        return;
      if (event.metaKey || event.ctrlKey) {
        const key = event.key.toLowerCase();
        if (key === "z" || key === "y") {
          event.preventDefault();
          submit({ kind: key === "y" || event.shiftKey ? "redo" : "undo" });
        }
        return;
      }
      if (!head) return;
      const key = event.key;
      if (!["Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key)) return;
      event.preventDefault();
      if (key === "ArrowDown") submit({ kind: "done", id: head.id });
      else
        routeInbox(
          key === "Enter"
            ? "Next Actions"
            : key === "ArrowLeft"
              ? "Do at"
              : key === "ArrowRight"
                ? "Waiting for"
                : "Project",
        );
    }
    // VS Code cancels native Undo and Redo in a Webview bubble listener.
    const capture = revision !== undefined;
    window.addEventListener("keydown", onKey, capture);
    return () => window.removeEventListener("keydown", onKey, capture);
  });

  function move(task: Task, group: Category, before?: string) {
    if (task.id === before || disabled) return;
    if (
      (group === "Waiting for" && !("person" in task)) ||
      (group === "Do at" && !("date" in task))
    ) {
      setEdit({ id: task.id, group, before, drag: true });
      return;
    }
    submit({
      kind: "move",
      id: task.id,
      group,
      before,
      reorder: true,
      person: "person" in task ? task.person : undefined,
      date: "date" in task ? task.date : undefined,
    });
  }

  function drop(event: DragEvent, group: Category, before?: string) {
    event.preventDefault();
    const id = event.dataTransfer.getData(dragType);
    const task = state.tasks.find((item) => item.id === id);
    if (task) move(task, group, before);
  }

  function handleKey(event: KeyboardEvent, task: Task) {
    const direction =
      event.key === "ArrowUp" || event.key === "ArrowLeft"
        ? -1
        : event.key === "ArrowDown" || event.key === "ArrowRight"
          ? 1
          : 0;
    if (!event.altKey || !direction) return;
    event.preventDefault();
    const group = task.group as Category;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const adjacent = categories[categories.indexOf(group) + direction];
      if (adjacent) move(task, adjacent);
      return;
    }
    const items = state.tasks.filter((item) => item.group === group);
    const index = items.indexOf(task);
    if (items[index + direction]) move(task, group, items[index + (direction < 0 ? -1 : 2)]?.id);
  }

  function renderCard(task: Task) {
    return (
      <TaskCard
        key={task.id}
        task={task}
        arriving={task.id === arrivingId}
        edit={edit?.id === task.id ? edit : undefined}
        onEdit={setEdit}
        onClose={() => setEdit(undefined)}
        submit={submit}
        completing={completing === task.id}
        disabled={disabled}
        onHandleKey={all && !edit?.drag ? handleKey : undefined}
        onDrop={all && !edit?.drag ? drop : undefined}
        onDrag={
          all && !edit?.drag
            ? (event, task) => {
                if (disabled) {
                  event.preventDefault();
                  return;
                }
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData(dragType, task.id);
              }
            : undefined
        }
      />
    );
  }

  const moving = edit?.drag && state.tasks.find((task) => task.id === edit.id);
  const list = all && (
    <div className={styles.list}>
      {categories.map((group) => {
        const items = state.tasks.filter(
          (task) => task.group === group && task.id !== (moving || undefined)?.id,
        );
        if (edit?.drag && moving && edit.group === group) {
          const index = items.findIndex((task) => task.id === edit.before);
          items.splice(index < 0 ? items.length : index, 0, moving);
        }
        return (
          <section
            key={group}
            className={styles.category}
            data-motion={group}
            onDragOver={(event) => {
              if (event.dataTransfer.types.includes(dragType)) event.preventDefault();
            }}
            onDrop={(event) => drop(event, group)}
          >
            <h2 className="font-bold">{group}</h2>
            {items.map(renderCard)}
          </section>
        );
      })}
      {!state.tasks.some((task) => task.group !== "Inbox" && task.group !== "Done") && (
        <p className="text-muted">No tasks</p>
      )}
    </div>
  );

  const heading = panels[panel];
  return (
    <div className={styles.workspace} data-active={panel}>
      <AddTask open={adding} setOpen={setAdding} disabled={disabled} submit={submit} />
      {panelOrder.map((item) =>
        item !== panel ? (
          <CollapsedPanel key={item} panel={item}>
            {item === "TADAs" ? (
              <Log tasks={state.tasks} today={today} />
            ) : (
              <StackPreview
                tasks={item === "Inbox" ? inbox : next}
                arrivingId={arrivingId}
                empty={item === "Inbox" ? "Inbox is empty" : "No next actions"}
              />
            )}
          </CollapsedPanel>
        ) : (
          <main
            key={item}
            className={`${styles.panel} ${panelSurface} bg-panel shadow-lg`}
            data-panel={item}
          >
            <div className={styles.panelHeading}>
              <h1 className="text-xl font-bold">
                <heading.Icon size={21} aria-hidden="true" />
                {panel}
              </h1>
              {panel === "TODOs" && (
                <nav aria-label="TODOs views" className={styles.views}>
                  <Link to="/tasks" aria-current={all ? "page" : undefined}>
                    All
                  </Link>
                  <Link to="/next" aria-current={all ? undefined : "page"}>
                    Next Actions
                  </Link>
                </nav>
              )}
            </div>
            {fetcher.data?.error && (
              <p role="alert" className={styles.error}>
                {fetcher.data.error}
              </p>
            )}
            {panel === "TADAs" ? (
              <Log tasks={state.tasks} today={today} renderCard={renderCard} />
            ) : all ? (
              list
            ) : (
              <div className={styles.stackLayout}>
                {panel === "TODOs" && head && (
                  <IconButton
                    label="Move to bottom"
                    disabled={disabled}
                    onClick={() => submit({ kind: "defer", id: head.id })}
                  >
                    <Redo size={21} />
                  </IconButton>
                )}
                <div
                  className={styles.stack}
                  data-motion={panel === "Inbox" ? "Inbox" : "Defer"}
                  data-depth={Math.min(3, stack.length)}
                >
                  {head ? (
                    renderCard(head)
                  ) : (
                    <p className={`${styles.empty} text-muted`}>
                      {panel === "Inbox" ? "Inbox is empty" : "No next actions"}
                    </p>
                  )}
                </div>
                {panel === "Inbox" && head && (
                  <button
                    type="button"
                    disabled={disabled}
                    className={cn(
                      styles.projectButton,
                      iconClass,
                      "rounded-lg text-base font-normal",
                    )}
                    onClick={() => routeInbox("Project")}
                  >
                    <ArrowLeft size={16} aria-hidden="true" />
                    Project
                  </button>
                )}
              </div>
            )}
          </main>
        ),
      )}
      {motion && <Flight key={motion.token} motion={motion} onArrival={setArrivedToken} />}
    </div>
  );
}
