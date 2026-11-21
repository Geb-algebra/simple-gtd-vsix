import { route, type RouteConfig } from "@react-router/dev/routes";

export default [route(":screen?", "workspace.tsx")] satisfies RouteConfig;
