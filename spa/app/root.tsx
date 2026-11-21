import type { ReactNode } from "react";
import { Links, Meta, Outlet, Scripts } from "react-router";
import "@fontsource/ubuntu/400.css";
import "@fontsource/ubuntu/500.css";
import "@fontsource/ubuntu/700.css";
import "@fontsource/noto-sans-jp/400.css";
import "@fontsource/noto-sans-jp/700.css";
import "./theme.css";
import { TooltipProvider } from "./components/ui/tooltip";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

export function HydrateFallback() {
  return <p role="status">Loading Simple GTD…</p>;
}

export function ErrorBoundary() {
  return <p role="alert">Simple GTD could not load. Reload the page to try again.</p>;
}

export default function App() {
  return (
    <TooltipProvider delay={350}>
      <Outlet />
    </TooltipProvider>
  );
}
