import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import { operationSchema } from "../spa/app/tasks";
import { appendInbox, files, initialMarkdown, readTasks, type Markdown } from "./markdown";

const viewId = "simpleGtd.workspace";
const decoder = new TextDecoder();
const encoder = new TextEncoder();

export function activate(context: vscode.ExtensionContext) {
  let folder: vscode.WorkspaceFolder | undefined;
  let queue: Promise<unknown> = Promise.resolve();

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(viewId, {
      async resolveWebviewView(view) {
        const assets = vscode.Uri.joinPath(context.extensionUri, "dist", "webview");
        view.webview.options = { enableScripts: true, localResourceRoots: [assets] };

        const refresh = () => {
          void view.webview.postMessage({ type: "refresh" });
        };
        const watcher = vscode.workspace.createFileSystemWatcher("**/_tasks/{inbox,tasks,log}.md");
        const subscriptions = [
          watcher,
          watcher.onDidChange(refresh),
          watcher.onDidCreate(refresh),
          watcher.onDidDelete(refresh),
          vscode.workspace.onDidChangeWorkspaceFolders(() => {
            if (folder && !vscode.workspace.getWorkspaceFolder(folder.uri)) folder = undefined;
            refresh();
          }),
          view.onDidChangeVisibility(() => {
            if (view.visible) refresh();
          }),
          view.webview.onDidReceiveMessage((message: unknown) => {
            const result = queue.then(() => handle(message));
            queue = result.catch(() => undefined);
            void result.then(
              (reply) => {
                if (reply) return view.webview.postMessage(reply);
              },
              (error: unknown) => console.error("Simple GTD", error),
            );
          }),
        ];
        view.onDidDispose(() => subscriptions.forEach((subscription) => subscription.dispose()));

        const html = decoder.decode(
          await vscode.workspace.fs.readFile(vscode.Uri.joinPath(assets, "webview.html")),
        );
        const nonce = randomBytes(16).toString("base64");
        const csp = `default-src 'none'; script-src 'nonce-${nonce}'; style-src ${view.webview.cspSource} 'unsafe-inline'; font-src ${view.webview.cspSource}; img-src ${view.webview.cspSource} data:;`;
        view.webview.html = html
          .replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`)
          .replace(
            /(src|href)="\.\/(assets\/[^"]+)"/g,
            (_, attr, path) =>
              `${attr}="${view.webview.asWebviewUri(vscode.Uri.joinPath(assets, path))}"`,
          )
          .replace(/<script\b/g, `<script nonce="${nonce}"`);
      },
    }),
  );

  async function handle(message: unknown) {
    if (
      !message ||
      typeof message !== "object" ||
      !("id" in message) ||
      typeof message.id !== "string"
    )
      return;
    const { id } = message;
    try {
      const operation =
        "operation" in message && message.operation !== undefined
          ? operationSchema.parse(message.operation)
          : undefined;
      if (operation && operation.kind !== "add")
        throw new Error("This action is not connected to Markdown yet.");
      const folders = vscode.workspace.workspaceFolders ?? [];
      folder ??=
        folders.length === 1
          ? folders[0]
          : folders.length
            ? await vscode.window.showWorkspaceFolderPick()
            : undefined;
      if (!folder) throw new Error("Open or select a workspace folder to use Simple GTD.");
      const directory = vscode.Uri.joinPath(folder.uri, "_tasks");
      await vscode.workspace.fs.createDirectory(directory);
      const markdown = { ...initialMarkdown };
      for (const file of files) {
        const uri = vscode.Uri.joinPath(directory, file);
        try {
          markdown[file] = decoder.decode(await vscode.workspace.fs.readFile(uri));
        } catch (error) {
          if (!(error instanceof vscode.FileSystemError) || error.code !== "FileNotFound")
            throw error;
          await vscode.workspace.fs.writeFile(uri, encoder.encode(initialMarkdown[file]));
        }
      }
      if (!operation) return { id, result: readTasks(markdown) };

      const inbox = vscode.Uri.joinPath(directory, "inbox.md");
      const document = vscode.workspace.textDocuments.find(
        (doc) => doc.uri.toString() === inbox.toString(),
      );
      if (
        document?.isDirty ||
        decoder.decode(await vscode.workspace.fs.readFile(inbox)) !== markdown["inbox.md"]
      ) {
        throw new Error("Inbox changed. Save your edits and try again.");
      }
      await vscode.workspace.fs.writeFile(
        inbox,
        encoder.encode(appendInbox(markdown["inbox.md"], operation.name)),
      );
      return {
        id,
        result: {
          id: `inbox.md:${markdown["inbox.md"].split(/\r?\n/).length - (markdown["inbox.md"].endsWith("\n") || !markdown["inbox.md"] ? 1 : 0)}`,
          name: operation.name,
          from: "Add",
          to: "Inbox",
        },
      };
    } catch (error) {
      return { id, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
