import { createRoot } from "react-dom/client";
import {
  createMemoryRouter,
  useLoaderData,
  useParams,
  type ActionFunctionArgs,
} from "react-router";
import { RouterProvider } from "react-router/dom";
import { TooltipProvider } from "./components/ui/tooltip";
import { operationSchema, stateSchema, type Operation } from "./tasks";
import { Workspace } from "./workspace";
import "@fontsource/ubuntu/400.css";
import "@fontsource/ubuntu/500.css";
import "@fontsource/ubuntu/700.css";
import "@fontsource/noto-sans-jp/400.css";
import "@fontsource/noto-sans-jp/700.css";
import "./theme.css";

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): { screen?: string } | undefined;
  setState(state: { screen: string }): void;
};

const vscode = acquireVsCodeApi();

function request(operation?: Operation): Promise<unknown> {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    function receive(event: MessageEvent) {
      if (event.data?.id !== id) return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", receive);
      if (typeof event.data.error === "string") reject(new Error(event.data.error));
      else resolve(event.data.result);
    }
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", receive);
      reject(new Error("Simple GTD did not respond."));
    }, 15000);
    window.addEventListener("message", receive);
    vscode.postMessage({ id, operation });
  });
}

async function loader() {
  return stateSchema.parse(await request());
}

async function action({ request: form }: ActionFunctionArgs) {
  try {
    const operation = operationSchema.parse(await form.json());
    return { error: "", transition: await request(operation) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Could not save the change.",
      transition: null,
    };
  }
}

function Screen() {
  return <Workspace state={useLoaderData<typeof loader>()} screen={useParams().screen} />;
}

const saved = vscode.getState()?.screen;
const router = createMemoryRouter(
  [
    {
      path: "/:screen?",
      loader,
      action,
      Component: Screen,
      HydrateFallback: () => <p role="status">Loading Simple GTD…</p>,
      errorElement: (
        <p role="alert">Could not open Simple GTD. Open a workspace folder and reopen the view.</p>
      ),
    },
  ],
  { initialEntries: [saved && ["/tasks", "/next", "/log"].includes(saved) ? saved : "/"] },
);

router.subscribe(({ location }) => vscode.setState({ screen: location.pathname }));
window.addEventListener("message", (event) => {
  if (event.data?.type === "refresh") void router.revalidate();
});

createRoot(document.getElementById("root")!).render(
  <TooltipProvider delay={350}>
    <RouterProvider router={router} />
  </TooltipProvider>,
);
