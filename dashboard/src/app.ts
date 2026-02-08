import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { DashboardShell } from "../../src/clawdbot/ui/shell.ts";
import type { DashboardRouteMatch } from "./router.ts";
import { createDefaultShell } from "../../src/clawdbot/ui/shell.ts";
import { matchDashboardRoute } from "./router.ts";
import "./components/dashboard-shell.ts";
import "./views/approvals.ts";
import "./views/command-center.ts";
import "./views/run-detail.ts";
import "./views/runs-list.ts";
import "./views/skills-registry.ts";
import "./views/workflow-catalog.ts";
import "./views/workflow-editor.ts";

function buildShellFromRoute(match: DashboardRouteMatch): DashboardShell {
  const shell = createDefaultShell();
  shell.pageTitle = match.route.title;
  shell.pageSubtitle = match.route.subtitle;
  shell.breadcrumbs = match.route.breadcrumbs;
  shell.sidebar = {
    ...shell.sidebar,
    activeItemId: match.route.activeSidebarItemId,
  };
  return shell;
}

@customElement("openclaw-dashboard-app")
export class OpenClawDashboardApp extends LitElement {
  static override styles = css`
    :host {
      display: block;
      min-height: 100vh;
    }

    .placeholder {
      border: 1px solid rgba(175, 196, 255, 0.2);
      border-radius: 16px;
      background: rgba(7, 13, 29, 0.72);
      padding: 24px;
      color: #f4f7ff;
    }

    .placeholder h2 {
      margin: 0;
      font-size: 1.15rem;
      font-weight: 650;
    }

    .placeholder p {
      margin: 12px 0 0;
      color: #b6c1dd;
      max-width: 58ch;
      line-height: 1.55;
    }
  `;

  @state() private routeMatch = matchDashboardRoute(window.location.pathname);
  @state() private shell = buildShellFromRoute(this.routeMatch);

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("popstate", this.handlePopState);
  }

  override disconnectedCallback(): void {
    window.removeEventListener("popstate", this.handlePopState);
    super.disconnectedCallback();
  }

  private readonly handlePopState = (): void => {
    this.syncRoute(window.location.pathname);
  };

  private readonly handleNavigation = (event: CustomEvent<{ href: string }>): void => {
    const href = event.detail.href;
    this.navigateTo(href);
  };

  private navigateTo(href: string): void {
    if (!href) {
      return;
    }

    const currentPath = window.location.pathname;
    if (currentPath !== href) {
      window.history.pushState({}, "", href);
    }
    this.syncRoute(href);
  }

  private syncRoute(pathname: string): void {
    this.routeMatch = matchDashboardRoute(pathname);
    this.shell = buildShellFromRoute(this.routeMatch);
  }

  private renderActiveView() {
    switch (this.routeMatch.route.id) {
      case "command-center":
        return html`
          <dashboard-command-center-view></dashboard-command-center-view>
        `;
      case "runs-list":
        return html`
          <dashboard-runs-list-view></dashboard-runs-list-view>
        `;
      case "run-detail":
        return html`<dashboard-run-detail-view .runId=${this.routeMatch.params.runId ?? ""}></dashboard-run-detail-view>`;
      case "approvals":
        return html`
          <dashboard-approvals-view></dashboard-approvals-view>
        `;
      case "workflow-catalog":
      case "workflow-catalog-list":
        return html`
          <dashboard-workflow-catalog-view></dashboard-workflow-catalog-view>
        `;
      case "workflow-editor":
        return html`
          <dashboard-workflow-editor-view></dashboard-workflow-editor-view>
        `;
      case "skills-registry":
        return html`
          <dashboard-skills-registry-view></dashboard-skills-registry-view>
        `;
      case "tools":
        return html`
          <section class="placeholder">
            <h2>Tools Route Stub</h2>
            <p>
              The shell and router are wired to DEFAULT_SIDEBAR_CONFIG. This route is intentionally a
              placeholder for future tools configuration surfaces.
            </p>
          </section>
        `;
      case "settings":
        return html`
          <section class="placeholder">
            <h2>Settings Route Stub</h2>
            <p>
              The settings path is registered and breadcrumb-aware so sidebar and route contracts stay in sync
              while settings views are implemented.
            </p>
          </section>
        `;
      default:
        return html`
          <dashboard-command-center-view></dashboard-command-center-view>
        `;
    }
  }

  override render() {
    return html`
      <openclaw-dashboard-shell
        .shell=${this.shell}
        .currentPath=${window.location.pathname}
        @dashboard:navigate=${this.handleNavigation}
      >
        ${this.renderActiveView()}
      </openclaw-dashboard-shell>
    `;
  }
}
