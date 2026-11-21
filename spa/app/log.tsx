import { useRef, useState } from "react";
import { localDay, type Task } from "./tasks";
import styles from "./workspace.module.css";

const month = new Intl.DateTimeFormat("en", { month: "short" });

export function Log({
  tasks,
  today,
  renderCard,
}: {
  tasks: Task[];
  today: string;
  renderCard: (task: Task) => React.ReactNode;
}) {
  const [selection, setDate] = useState<string>();
  const details = useRef<HTMLElement>(null);
  const date = selection ?? today;
  const byDay = new Map<string, Task[]>();
  for (const task of tasks) {
    if (task.group === "Done") {
      const group = byDay.get(task.completed) ?? [];
      group.push(task);
      byDay.set(task.completed, group);
    }
  }
  const end = new Date(`${today}T12:00:00`);
  const start = new Date(end);
  start.setDate(start.getDate() - 62);
  const offset = start.getDay();
  const days = Array.from({ length: 63 }, (_, index) => {
    const current = new Date(start);
    current.setDate(start.getDate() + index);
    const key = localDay(current);
    return { key, current, count: byDay.get(key)?.length ?? 0, cell: offset + index };
  });
  const selected = byDay.get(date) ?? [];
  const weeks = Math.ceil((offset + days.length) / 7);

  return (
    <div className={styles.list}>
      <section
        className={`${styles.heatCard} rounded-lg border border-line bg-white shadow-md`}
        aria-label="Completion heatmap"
      >
        <div
          className={styles.heatmap}
          style={{ gridTemplateColumns: `min-content repeat(${weeks}, minmax(0, 1fr))` }}
        >
          {["Sun", "Tue", "Thu", "Sat"].map((name, i) => (
            <span
              key={name}
              className={styles.heatLabel}
              style={{ gridColumn: 1, gridRow: i * 2 + 2 }}
            >
              {name}
            </span>
          ))}
          {days.map(({ current, cell, count, key }) => {
            const col = Math.floor(cell / 7) + 2;
            return (
              <span className={styles.heatContents} key={key}>
                {current.getDate() === 1 && (
                  <span className={styles.heatLabel} style={{ gridColumn: col, gridRow: 1 }}>
                    {month.format(current)}
                  </span>
                )}
                <button
                  type="button"
                  className={`${styles.heatDay} rounded-xs focus-visible:outline-2`}
                  data-level={Math.min(count, 4)}
                  aria-pressed={key === date}
                  title={`${key} · ${count} completed`}
                  aria-label={`${key}, ${count} completed`}
                  onClick={() => {
                    setDate(key);
                    requestAnimationFrame(() =>
                      details.current?.scrollIntoView({ block: "nearest" }),
                    );
                  }}
                  style={{ gridColumn: col, gridRow: (cell % 7) + 2 }}
                />
              </span>
            );
          })}
        </div>
      </section>
      <section ref={details} className={styles.category} aria-label={date}>
        <h2 className="font-bold">
          {date} <span className="text-muted">· {selected.length} completed</span>
        </h2>
        {selected.map(renderCard)}
      </section>
    </div>
  );
}
