import { localDay, stateSchema, type State, type Task } from "../spa/app/tasks";

export const files = ["inbox.md", "tasks.md", "log.md"] as const;
export type MarkdownFile = (typeof files)[number];
export type Markdown = Record<MarkdownFile, string>;

export const initialMarkdown: Markdown = {
  "inbox.md": "",
  "tasks.md": "## Next Actions\n\n## Someday\n\n## Waiting for\n\n## Do at\n",
  "log.md": "# log\n",
};

export function readTasks(markdown: Markdown, today = localDay()): State {
  const tasks: Task[] = [];
  for (const file of files) {
    let heading = "";
    let fence: string | undefined;
    markdown[file].split(/\r?\n/).forEach((line, index) => {
      const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (marker) {
        if (!fence) fence = marker[1];
        else if (marker[1].startsWith(fence) && !marker[2].trim()) fence = undefined;
        return;
      }
      if (fence) return;
      const section = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*$/.exec(line);
      if (section) heading = section[1] === "##" ? section[2] : "";
      const item = /^[-*+][ \t]+(.+)$/.exec(line);
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

export function appendInbox(source: string, name: string) {
  if (/[\r\n]/.test(name) || /^\[[ xX]\](?:\s|$)/.test(name)) {
    throw new Error("Enter a single-line task name without a checklist marker.");
  }
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  return source + (source && !source.endsWith("\n") ? newline : "") + `- ${name}${newline}`;
}
