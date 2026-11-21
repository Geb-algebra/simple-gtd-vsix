import { localDay, stateSchema, type State, type Task } from "../spa/app/tasks";

export const files = ["inbox.md", "tasks.md", "log.md"] as const;
export type MarkdownFile = (typeof files)[number];
export type Markdown = Record<MarkdownFile, string>;

export const initialMarkdown: Markdown = {
  "inbox.md": "",
  "tasks.md": "## Next Actions\n\n## Someday\n\n## Waiting for\n\n## Do at\n",
  "log.md": "# log\n",
};

const headingPattern = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*$/;

function visibleLines(lines: string[]) {
  let fence: string | undefined;
  let comment = false;
  return lines.map((line) => {
    if (!fence && (comment || line.trimStart().startsWith("<!--"))) {
      comment = !line.includes("-->");
      return "";
    }
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1].startsWith(fence) && !marker[2].trim()) fence = undefined;
      return "";
    }
    return fence ? "" : line;
  });
}

export function readTasks(markdown: Markdown, today = localDay()): State {
  const tasks: Task[] = [];
  for (const file of files) {
    let heading = "";
    visibleLines(markdown[file].replace(/^\uFEFF/, "").split(/\r?\n/)).forEach((line, index) => {
      const section = headingPattern.exec(line);
      if (section) heading = section[1] === "##" ? section[2] : "";
      const item = /^(?:\uFEFF)?[-*+][ \t]+(.+)$/.exec(line);
      if (!item) return;
      const name = item[1].trim();
      if (!name || /^\[[ xX]\](?:\s|$)/.test(name)) return;
      const id = `${file}:${index}`;
      let task: Task | undefined;
      if (file === "inbox.md") task = { id, name, group: "Inbox" };
      else if (file === "log.md" && /^\d{6}$/.test(heading)) {
        const completed = `20${heading.slice(0, 2)}-${heading.slice(2, 4)}-${heading.slice(4)}`;
        task = { id, name, group: "Done", completed };
      } else if (file === "tasks.md") {
        if (heading === "Next Actions" || heading === "Someday")
          task = { id, name, group: heading };
        if (heading === "Waiting for" || heading === "Do at") {
          const attribute = /^(.+?)\s+@([^@]+)$/.exec(name);
          if (attribute) {
            task =
              heading === "Waiting for"
                ? { id, name: attribute[1], group: heading, person: attribute[2] }
                : { id, name: attribute[1], group: heading, date: attribute[2] };
          }
        }
      }
      if (task) {
        const result = stateSchema.shape.tasks.element.safeParse(task);
        if (result.success) tasks.push(result.data);
      }
    });
  }
  return { tasks, deferred: [], deferDay: today, undo: [], redo: [] };
}

function taskName(name: string) {
  if (/[\r\n]/.test(name) || /^\[[ xX]\](?:\s|$)/.test(name)) {
    throw new Error("Enter a single-line task name without a checklist marker.");
  }
  return name;
}

function sectionOf(task: Task): string {
  return task.group === "Done" ? task.completed.slice(2).replaceAll("-", "") : task.group;
}

function fileOf(section: string): MarkdownFile {
  if (section === "Inbox") return "inbox.md";
  return /^\d{6}$/.test(section) ? "log.md" : "tasks.md";
}

function groupTasks(tasks: Task[]) {
  const sections = new Map<string, Task[]>();
  for (const task of tasks) {
    const section = sectionOf(task);
    const entries = sections.get(section) ?? [];
    entries.push(task);
    sections.set(section, entries);
  }
  return sections;
}

function serialize(task: Task) {
  const name = taskName(task.name);
  if (task.group === "Waiting for") {
    if (/[@\r\n]/.test(task.person)) throw new Error("Enter a person without @ or line breaks.");
    return `- ${name} @${task.person}`;
  }
  return task.group === "Do at" ? `- ${name} @${task.date}` : `- ${name}`;
}

function sameTask(left: Task, right: Task) {
  return (
    left.name === right.name &&
    left.group === right.group &&
    (left.group !== "Waiting for" ||
      (right.group === "Waiting for" && left.person === right.person)) &&
    (left.group !== "Do at" || (right.group === "Do at" && left.date === right.date))
  );
}

export function editMarkdown(markdown: Markdown, before: Task[], after: Task[]): Markdown {
  const from = groupTasks(before);
  const to = groupTasks(after);
  const positions = groupTasks(readTasks(markdown).tasks);
  const result = { ...markdown };
  for (const file of files) {
    const prefix = markdown[file].startsWith("\uFEFF") ? "\uFEFF" : "";
    const source = markdown[file].slice(prefix.length);
    const lines = source.match(/[^\n]*\n|[^\n]+$/g) ?? [];
    const content = lines.map((line) => line.replace(/\r?\n$/, ""));
    const headings = visibleLines(content).map((line) => {
      const heading = headingPattern.exec(line);
      return heading?.[1] === "##" ? heading[2] : "";
    });
    const newline = source.includes("\r\n") ? "\r\n" : "\n";
    const edits = new Map<number, { insert: string[]; replacement?: string }>();
    function edit(index: number) {
      const entry = edits.get(index) ?? { insert: [] };
      edits.set(index, entry);
      return entry;
    }

    for (const section of new Set([...from.keys(), ...to.keys()])) {
      if (fileOf(section) !== file) continue;
      const previous = from.get(section) ?? [];
      const next = to.get(section) ?? [];
      if (previous.length === next.length && previous.every((task, i) => task === next[i]))
        continue;
      const rows = (positions.get(section) ?? []).map((task) => Number(task.id.split(":")[1]));
      if (rows.length !== previous.length)
        throw new Error("Markdown tasks changed. Reload and try again.");
      const original = new Map(
        previous.map((task, index) => [task.id, { task, line: content[rows[index]] }]),
      );
      const render = (task: Task) => {
        const existing = original.get(task.id);
        return existing && sameTask(existing.task, task) ? existing.line : serialize(task);
      };

      rows.forEach((row, index) => {
        const task = next[index];
        const ending = lines[row].slice(content[row].length);
        edit(row).replacement = task ? render(task) + ending : "";
      });
      if (next.length <= rows.length) continue;
      const extra = next.slice(rows.length).map(render);
      if (section === "Inbox") {
        edit(lines.length).insert.push(...extra);
      } else if (rows.length) {
        edit(rows.at(-1)! + 1).insert.push(...extra);
      } else {
        const heading = headings.indexOf(section);
        if (heading >= 0) {
          edit(heading + 1).insert.push("", ...extra);
        } else {
          const firstDate =
            file === "log.md" ? headings.findIndex((value) => /^\d{6}$/.test(value)) : -1;
          const index = firstDate < 0 ? lines.length : firstDate;
          edit(index).insert.push("", `## ${section}`, "", ...extra, "");
        }
      }
    }

    if (!edits.size) continue;
    let output = "";
    for (let index = 0; index <= lines.length; index++) {
      const entry = edits.get(index);
      if (entry?.insert.length) {
        if (output && !output.endsWith("\n")) output += newline;
        output += entry.insert.join(newline) + newline;
      }
      output += entry?.replacement ?? lines[index] ?? "";
    }
    result[file] = prefix + output;
  }

  const parsed = groupTasks(readTasks(result).tasks);
  for (const section of new Set([...parsed.keys(), ...to.keys()])) {
    const actual = parsed.get(section) ?? [];
    const expected = to.get(section) ?? [];
    if (
      actual.length !== expected.length ||
      expected.some((task, index) => !sameTask(task, actual[index]))
    ) {
      throw new Error("This change cannot be represented in the current Markdown layout.");
    }
  }
  return result;
}
