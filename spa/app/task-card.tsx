import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { CalendarDays, Check, GripVertical, UserRound } from "lucide-react";
import { ButtonTooltip } from "./components/ui/tooltip";
import { Input } from "./components/ui/input";
import { Checkbox } from "./components/ui/checkbox";
import { Calendar } from "./components/ui/calendar";
import { Popover, PopoverContent } from "./components/ui/popover";
import { localDay, type Category, type Operation, type Task } from "./tasks";
import styles from "./workspace.module.css";

export type Attribute = "Waiting for" | "Do at";
export type Edit = { id: string; group: Attribute; before?: string; drag?: boolean };
export type Submit = (operation: Operation, source?: HTMLElement) => void;

export const cardClass = `${styles.card} rounded-lg border border-card-line bg-white shadow-md`;

export const iconClass =
  "rounded-md text-ink hover:bg-wash focus-visible:outline-2 disabled:opacity-50";

export function IconButton({
  label,
  onClick,
  children,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <ButtonTooltip label={label}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        className={`${styles.iconButton} ${iconClass}`}
        onClick={onClick}
      >
        {children}
      </button>
    </ButtonTooltip>
  );
}

export function AttributeInput({
  edit,
  task,
  allowSomeday,
  onSave,
  onClose,
}: {
  edit: Edit;
  task: Task;
  allowSomeday: boolean;
  onSave: (operation: Operation) => void;
  onClose: () => void;
}) {
  const isDate = edit.group === "Do at";
  const initial = isDate ? ("date" in task ? task.date : "") : "person" in task ? task.person : "";
  const [value, setValue] = useState(initial);
  const [calendar, setCalendar] = useState(isDate);
  const input = useRef<HTMLInputElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const finished = useRef(false);

  useEffect(() => {
    input.current?.focus();
  }, []);

  function finish(enter: boolean) {
    if (finished.current) return;
    const text = value.trim();
    const group = isDate && !text && enter && allowSomeday ? "Someday" : edit.group;
    const validDate =
      /^\d{4}-\d{2}-\d{2}$/.test(text) && localDay(new Date(`${text}T12:00:00`)) === text;
    const operation: Operation | null =
      group === "Someday"
        ? { kind: "move", id: task.id, group, before: edit.before }
        : group === "Do at" && validDate
          ? { kind: "move", id: task.id, group, date: text, before: edit.before }
          : group === "Waiting for" && text
            ? { kind: "move", id: task.id, group, person: text, before: edit.before }
            : null;

    if (enter && !operation && text) {
      input.current?.setCustomValidity("Enter a date in YYYY-MM-DD format.");
      input.current?.reportValidity();
      return;
    }
    if (enter && !operation) return;
    finished.current = true;
    if (operation && (enter || task.group !== "Inbox")) onSave(operation);
    onClose();
  }

  return (
    <div
      className={styles.attributeEditor}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (event.currentTarget.contains(next) || popup.current?.contains(next)) return;
        finish(false);
      }}
    >
      <Input
        ref={input}
        className={styles.field}
        aria-label={isDate ? "Scheduled date" : "Person"}
        placeholder={isDate ? "YYYY-MM-DD" : "Person"}
        value={value}
        onChange={(event) => {
          event.currentTarget.setCustomValidity("");
          setValue(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") {
            event.preventDefault();
            finish(true);
          }
          if (event.key === "Escape") {
            finished.current = true;
            onClose();
          }
          if (event.key === "ArrowDown" && isDate) {
            event.preventDefault();
            if (!calendar) setCalendar(true);
            else popup.current?.querySelector<HTMLButtonElement>("button[tabindex='0']")?.focus();
          }
        }}
      />
      {isDate && (
        <Popover open={calendar} onOpenChange={setCalendar}>
          <PopoverContent
            ref={popup}
            className="w-fit gap-0 rounded-xl p-2"
            anchor={input}
            initialFocus={false}
            finalFocus={false}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setCalendar(false);
                input.current?.focus();
              }
            }}
          >
            <Calendar
              className="p-0"
              mode="single"
              selected={value ? new Date(`${value}T12:00:00`) : undefined}
              onSelect={(date) => {
                if (date) {
                  const selected = localDay(date);
                  setValue(selected);
                  setCalendar(false);
                  input.current?.focus();
                }
              }}
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

export function TaskCard({
  task,
  edit,
  onEdit,
  onClose,
  submit,
  onHandleKey,
  onDrag,
  onDrop,
  completing,
  disabled,
}: {
  task: Task;
  edit?: Edit;
  onEdit?: (edit: Edit) => void;
  onClose?: () => void;
  submit: Submit;
  onHandleKey?: (event: KeyboardEvent, task: Task) => void;
  onDrag?: (event: DragEvent, task: Task) => void;
  onDrop?: (event: DragEvent, group: Category, before?: string) => void;
  completing: boolean;
  disabled: boolean;
}) {
  const card = useRef<HTMLElement>(null);
  const [draftName, setDraftName] = useState<string>();
  const done = task.group === "Done";
  const showActions =
    task.group === "Inbox" || task.group === "Next Actions" || task.group === "Someday";
  const save: Submit = (operation) => submit(operation, card.current ?? undefined);

  return (
    <article
      ref={card}
      data-task={task.id}
      className={cardClass}
      onDragOver={
        onDrop
          ? (event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
            }
          : undefined
      }
      onDrop={
        onDrop
          ? (event) => {
              event.stopPropagation();
              onDrop(event, task.group as Category, task.id);
            }
          : undefined
      }
    >
      <span className={styles.handle}>
        {onDrag && (
          <ButtonTooltip label="Move task · drag or press Alt and an arrow key">
            <button
              type="button"
              aria-label={`Move ${task.name}`}
              className={`${styles.grip} text-muted hover:text-ink focus-visible:outline-2`}
              draggable
              onDragStart={(event) => onDrag(event, task)}
              onKeyDown={(event) => onHandleKey?.(event, task)}
            >
              <GripVertical size={17} />
            </button>
          </ButtonTooltip>
        )}
      </span>
      <Checkbox
        checked={done || completing}
        disabled={done || disabled}
        aria-label={`Complete ${task.name}`}
        className={styles.check}
        onCheckedChange={(checked) => {
          if (checked) save({ kind: "done", id: task.id });
        }}
      />
      {done ? (
        <span className={styles.taskName}>{task.name}</span>
      ) : (
        <div className={styles.titleEditor}>
          <span aria-hidden="true" className={`${styles.titleText} ${styles.titleMeasure}`}>
            {draftName ?? task.name}{" "}
          </span>
          <textarea
            key={task.name}
            aria-label="Task name"
            title={task.name}
            defaultValue={task.name}
            disabled={disabled}
            className={`${styles.taskName} ${styles.titleInput}`}
            rows={1}
            onChange={(event) => setDraftName(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                event.currentTarget.value = task.name;
                event.currentTarget.blur();
              }
            }}
            onBlur={(event) => {
              const name = event.currentTarget.value.replace(/\r?\n/g, " ").trim();
              event.currentTarget.value = task.name;
              setDraftName(undefined);
              if (name && name !== task.name) save({ kind: "rename", id: task.id, name });
            }}
          />
        </div>
      )}
      <div className={styles.attributes}>
        {edit && onClose ? (
          <AttributeInput
            key={edit.group}
            edit={edit}
            task={task}
            allowSomeday={task.group === "Inbox" || task.group === "Next Actions"}
            onClose={onClose}
            onSave={save}
          />
        ) : (
          <>
            {"person" in task && (
              <button
                className={styles.attribute}
                type="button"
                disabled={disabled}
                onClick={() => onEdit?.({ id: task.id, group: "Waiting for" })}
                title={task.person}
              >
                <UserRound size={14} />
                <span>{task.person}</span>
              </button>
            )}
            {"date" in task && (
              <button
                className={styles.attribute}
                type="button"
                disabled={disabled}
                onClick={() => onEdit?.({ id: task.id, group: "Do at" })}
                title={task.date}
              >
                <CalendarDays size={14} />
                <span>{task.date}</span>
              </button>
            )}
            {showActions && (
              <div className={styles.actionIcons}>
                <IconButton
                  label="Waiting for"
                  disabled={disabled}
                  onClick={() => onEdit?.({ id: task.id, group: "Waiting for" })}
                >
                  <UserRound size={17} />
                </IconButton>
                <IconButton
                  label="Do at"
                  disabled={disabled}
                  onClick={() => onEdit?.({ id: task.id, group: "Do at" })}
                >
                  <CalendarDays size={17} />
                </IconButton>
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}

export function FlightCard({ name, checked }: { name: string; checked: boolean }) {
  return (
    <div className={cardClass}>
      <span />
      <span className={`${styles.flightCheck} rounded border border-line`}>
        {checked && <Check size={15} />}
      </span>
      <span className={styles.titleText}>{name}</span>
      <span />
    </div>
  );
}
