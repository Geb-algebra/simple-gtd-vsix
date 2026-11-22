import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import { localDay, workspaceRequestSchema } from "../spa/app/tasks";
import { files, initialMarkdown, type Markdown, type MarkdownFile } from "./markdown";
import { sameMarkdown, WorkspaceSession } from "./session";
import { saveMarkdown, verifyUnchanged, type MarkdownStorage } from "./storage";

const viewId = "simpleGtd.workspace";
const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
const encoder = new TextEncoder();

export async function activate(context: vscode.ExtensionContext) {
  const assets = vscode.Uri.joinPath(context.extensionUri, "dist", "webview");
  const html = decoder.decode(
    await vscode.workspace.fs.readFile(vscode.Uri.joinPath(assets, "webview.html")),
  );
  let folder: vscode.WorkspaceFolder | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  const sessions = new Map<string, WorkspaceSession>();
  let refreshView: (() => void) | undefined;

  context.subscriptions.push(
    vscode.commands.registerCommand("simpleGtd.selectFolder", async () => {
      const selected = await vscode.window.showWorkspaceFolderPick();
      if (!selected) return;
      folder = selected;
      refreshView?.();
      await vscode.commands.executeCommand(`${viewId}.focus`);
    }),
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(viewId, {
      resolveWebviewView(view) {
        view.webview.options = { enableScripts: true, localResourceRoots: [assets] };

        const refresh = () => {
          void view.webview.postMessage({ type: "refresh" });
        };
        refreshView = refresh;
        const watcher = vscode.workspace.createFileSystemWatcher("**/_tasks/{inbox,tasks,log}.md");
        const subscriptions = [
          watcher,
          watcher.onDidChange(refresh),
          watcher.onDidCreate(refresh),
          watcher.onDidDelete(refresh),
          vscode.workspace.onDidSaveTextDocument(({ uri }) => {
            if (files.some((file) => uri.path.endsWith(`/_tasks/${file}`))) refresh();
          }),
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
        view.onDidDispose(() => {
          if (refreshView === refresh) refreshView = undefined;
          subscriptions.forEach((subscription) => subscription.dispose());
        });

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
      const { operation, revision, today } = workspaceRequestSchema.parse(message);
      const folders = vscode.workspace.workspaceFolders ?? [];
      folder ??=
        folders.length === 1
          ? folders[0]
          : folders.length
            ? await vscode.window.showWorkspaceFolderPick()
            : undefined;
      if (!folder) throw new Error("Open or select a workspace folder to use Simple GTD.");
      const selected = folder;
      const key = selected.uri.toString();
      const directory = vscode.Uri.joinPath(selected.uri, "_tasks");
      const markdown = await loadMarkdown(directory, !operation);

      let session = sessions.get(key);
      if (!session || !sameMarkdown(session.markdown, markdown)) {
        session = new WorkspaceSession(markdown);
        sessions.set(key, session);
      }
      if (!operation) return { id, result: { state: session.state, revision: session.revision } };
      if (revision !== session.revision)
        throw new Error("Tasks changed. Check the refreshed view and try again.");
      const storage = workspaceStorage(directory);
      await verifyUnchanged(storage, markdown);

      const transition = await session.change(
        operation,
        today ?? localDay(),
        (next) => saveMarkdown(storage, markdown, next),
        async (name) => {
          const configuration = vscode.workspace.getConfiguration("simpleGtd", selected.uri);
          const command = (
            vscode.workspace.isTrusted
              ? configuration.get<string>("projectCommand")
              : configuration.inspect<string>("projectCommand")?.globalValue
          )?.trim();
          if (!command) {
            throw new Error(
              vscode.workspace.isTrusted
                ? "Set Simple GTD: Project Command in User, Remote, or Workspace Settings."
                : "Set Simple GTD: Project Command in User Settings or trust this workspace to use its setting.",
            );
          }
          const result = await vscode.commands.executeCommand(command, { name, folderUri: key });
          if (result === false) throw new Error("The project command did not create a project.");
        },
      );
      return { id, result: transition };
    } catch (error) {
      return { id, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

async function loadMarkdown(directory: vscode.Uri, initialize: boolean) {
  if (initialize) await vscode.workspace.fs.createDirectory(directory);
  const markdown = { ...initialMarkdown };
  for (const file of files) {
    const uri = vscode.Uri.joinPath(directory, file);
    try {
      markdown[file] = decoder.decode(await vscode.workspace.fs.readFile(uri));
    } catch (error) {
      if (
        !initialize ||
        !(error instanceof vscode.FileSystemError) ||
        error.code !== "FileNotFound"
      )
        throw error;
      await vscode.workspace.fs.writeFile(uri, encoder.encode(initialMarkdown[file]));
    }
  }
  return markdown;
}

function workspaceStorage(directory: vscode.Uri): MarkdownStorage {
  const fileUri = (file: MarkdownFile) => vscode.Uri.joinPath(directory, file);
  return {
    async read(file) {
      return decoder.decode(await vscode.workspace.fs.readFile(fileUri(file)));
    },
    async write(file, value) {
      await vscode.workspace.fs.writeFile(fileUri(file), encoder.encode(value));
    },
    isDirty(file) {
      const uri = fileUri(file).toString();
      return vscode.workspace.textDocuments.some(
        (doc) => doc.isDirty && doc.uri.toString() === uri,
      );
    },
  };
}
