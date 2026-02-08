import type { BreadcrumbItem } from "../../src/clawdbot/ui/shell.ts";

export type DashboardRouteId =
  | "command-center"
  | "runs-list"
  | "run-detail"
  | "approvals"
  | "workflow-catalog"
  | "workflow-catalog-list"
  | "workflow-editor"
  | "skills-registry"
  | "tools"
  | "settings";

export type DashboardRouteDefinition = {
  id: DashboardRouteId;
  path: string;
  title: string;
  subtitle?: string;
  breadcrumbs: BreadcrumbItem[];
  activeSidebarItemId: string;
};

type CompiledRoute = DashboardRouteDefinition & {
  matcher: RegExp;
  paramNames: string[];
};

export type DashboardRouteMatch = {
  route: DashboardRouteDefinition;
  params: Record<string, string>;
};

const ROUTES: DashboardRouteDefinition[] = [
  {
    id: "command-center",
    path: "/",
    title: "Command Center",
    subtitle: "Live pulse of runs, approvals, health, and spend.",
    breadcrumbs: [{ label: "Dashboard" }, { label: "Command Center" }],
    activeSidebarItemId: "dashboard",
  },
  {
    id: "runs-list",
    path: "/runs",
    title: "Runs",
    subtitle: "Filter and inspect executions with table-first triage.",
    breadcrumbs: [{ label: "Dashboard", href: "/" }, { label: "Runs" }],
    activeSidebarItemId: "runs",
  },
  {
    id: "run-detail",
    path: "/runs/:runId",
    title: "Run Detail",
    subtitle: "Timeline and step inspector for a single run.",
    breadcrumbs: [
      { label: "Dashboard", href: "/" },
      { label: "Runs", href: "/runs" },
      { label: "Run Detail" },
    ],
    activeSidebarItemId: "runs",
  },
  {
    id: "approvals",
    path: "/approvals",
    title: "Approvals",
    subtitle: "Queue view for approve and reject action stubs.",
    breadcrumbs: [{ label: "Dashboard", href: "/" }, { label: "Approvals" }],
    activeSidebarItemId: "approvals",
  },
  {
    id: "workflow-catalog",
    path: "/workflows",
    title: "Workflow Catalog",
    subtitle: "Browse templates in grid or list mode.",
    breadcrumbs: [{ label: "Dashboard", href: "/" }, { label: "Workflows" }],
    activeSidebarItemId: "workflows",
  },
  {
    id: "workflow-catalog-list",
    path: "/workflows/catalog",
    title: "Workflow Catalog",
    subtitle: "Browse templates in grid or list mode.",
    breadcrumbs: [
      { label: "Dashboard", href: "/" },
      { label: "Workflows", href: "/workflows" },
      { label: "Catalog" },
    ],
    activeSidebarItemId: "workflow-catalog",
  },
  {
    id: "workflow-editor",
    path: "/workflows/editor",
    title: "Workflow Editor",
    subtitle: "Visual n8n canvas with skill binding preflight.",
    breadcrumbs: [
      { label: "Dashboard", href: "/" },
      { label: "Workflows", href: "/workflows" },
      { label: "Editor" },
    ],
    activeSidebarItemId: "workflow-editor",
  },
  {
    id: "skills-registry",
    path: "/skills",
    title: "Skills Registry",
    subtitle: "Grid or list registry with a reusable detail drawer.",
    breadcrumbs: [{ label: "Dashboard", href: "/" }, { label: "Skills" }],
    activeSidebarItemId: "skills",
  },
  {
    id: "tools",
    path: "/tools",
    title: "Tools",
    subtitle: "Route stub wired to shell contracts for future settings.",
    breadcrumbs: [{ label: "Dashboard", href: "/" }, { label: "Tools" }],
    activeSidebarItemId: "tools",
  },
  {
    id: "settings",
    path: "/settings",
    title: "Settings",
    subtitle: "Route stub wired to shell contracts for future settings.",
    breadcrumbs: [{ label: "Dashboard", href: "/" }, { label: "Settings" }],
    activeSidebarItemId: "settings",
  },
];

const COMPILED_ROUTES: CompiledRoute[] = ROUTES.map((route) => {
  const { matcher, paramNames } = compileRoutePattern(route.path);
  return { ...route, matcher, paramNames };
});

function compileRoutePattern(path: string): { matcher: RegExp; paramNames: string[] } {
  if (path === "/") {
    return { matcher: /^\/$/, paramNames: [] };
  }

  const segments = path.split("/").filter(Boolean);
  const paramNames: string[] = [];
  const pattern = segments
    .map((segment) => {
      if (segment.startsWith(":")) {
        paramNames.push(segment.slice(1));
        return "([^/]+)";
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");

  return {
    matcher: new RegExp(`^/${pattern}$`),
    paramNames,
  };
}

export function normalizePathname(pathname: string): string {
  const raw = pathname.trim();
  if (!raw || raw === "/index.html") {
    return "/";
  }

  const withoutIndex = raw.endsWith("/index.html") ? raw.slice(0, -"/index.html".length) : raw;
  if (!withoutIndex || withoutIndex === "/") {
    return "/";
  }

  const prefixed = withoutIndex.startsWith("/") ? withoutIndex : `/${withoutIndex}`;
  if (prefixed.length > 1 && prefixed.endsWith("/")) {
    return prefixed.slice(0, -1);
  }
  return prefixed;
}

export function matchDashboardRoute(pathname: string): DashboardRouteMatch {
  const normalized = normalizePathname(pathname);
  for (const route of COMPILED_ROUTES) {
    const matched = normalized.match(route.matcher);
    if (!matched) {
      continue;
    }

    const params: Record<string, string> = {};
    route.paramNames.forEach((name, index) => {
      const value = matched[index + 1];
      if (value) {
        params[name] = decodeURIComponent(value);
      }
    });

    return {
      route,
      params,
    };
  }

  return {
    route: COMPILED_ROUTES[0],
    params: {},
  };
}

export function getRouteDefinitions(): DashboardRouteDefinition[] {
  return [...ROUTES];
}
