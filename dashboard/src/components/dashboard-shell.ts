import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { DashboardShell, NavigationItem } from "../../../src/clawdbot/ui/shell.ts";
import { createDefaultShell } from "../../../src/clawdbot/ui/shell.ts";

@customElement("openclaw-dashboard-shell")
export class OpenClawDashboardShell extends LitElement {
  static override styles = css`
    :host {
      display: block;
      min-height: 100vh;
      color: var(--text-primary, #f4f7ff);
      font-family: var(--font-ui, "Space Grotesk", sans-serif);
    }

    .frame {
      display: grid;
      grid-template-columns: var(--sidebar-width, 270px) minmax(0, 1fr);
      min-height: 100vh;
      backdrop-filter: blur(4px);
    }

    .frame.collapsed {
      grid-template-columns: var(--sidebar-width, 84px) minmax(0, 1fr);
    }

    .sidebar {
      position: sticky;
      top: 0;
      height: 100vh;
      border-right: 1px solid rgba(175, 196, 255, 0.16);
      background:
        linear-gradient(210deg, rgba(14, 165, 233, 0.16), transparent 40%),
        linear-gradient(160deg, rgba(34, 197, 94, 0.08), transparent 58%), rgba(7, 13, 29, 0.94);
      padding: 22px 14px;
      overflow-y: auto;
    }

    .brand {
      padding: 0 10px 14px;
      border-bottom: 1px solid rgba(175, 196, 255, 0.16);
      margin-bottom: 14px;
    }

    .brand-title {
      display: block;
      font-size: 1rem;
      font-weight: 680;
      letter-spacing: 0.02em;
      color: #ecf4ff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .brand-meta {
      display: block;
      margin-top: 4px;
      color: rgba(222, 235, 255, 0.68);
      font-size: 0.79rem;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .nav-list,
    .child-list {
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .nav-link {
      width: 100%;
      border: 1px solid transparent;
      background: transparent;
      color: #d8e6ff;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px;
      border-radius: 12px;
      text-decoration: none;
      font: inherit;
      cursor: pointer;
      transition:
        border-color 120ms ease,
        background-color 120ms ease,
        color 120ms ease;
    }

    .nav-link:hover {
      background: rgba(29, 44, 85, 0.75);
      border-color: rgba(175, 196, 255, 0.24);
    }

    .nav-link.active {
      background: linear-gradient(120deg, rgba(14, 165, 233, 0.22), rgba(34, 197, 94, 0.16));
      border-color: rgba(64, 196, 255, 0.56);
      color: #f4f7ff;
    }

    .nav-link.disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }

    .icon {
      width: 2ch;
      text-align: center;
      opacity: 0.86;
      font-family: var(--font-mono, "JetBrains Mono", monospace);
      font-size: 0.8rem;
    }

    .label {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.95rem;
      font-weight: 560;
    }

    .child-list {
      margin: 5px 0 8px 20px;
      padding-left: 8px;
      border-left: 1px dashed rgba(175, 196, 255, 0.22);
      display: grid;
      gap: 4px;
    }

    .child-list .nav-link {
      font-size: 0.9rem;
      padding: 8px;
      border-radius: 10px;
    }

    .chrome {
      min-width: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
    }

    .topbar {
      position: sticky;
      top: 0;
      z-index: 5;
      display: grid;
      gap: 10px;
      padding: 14px 20px;
      border-bottom: 1px solid rgba(175, 196, 255, 0.16);
      background: rgba(11, 19, 40, 0.88);
      backdrop-filter: blur(6px);
    }

    .topbar-header {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .toggle {
      border: 1px solid rgba(175, 196, 255, 0.28);
      background: rgba(18, 29, 57, 0.84);
      color: #ecf4ff;
      border-radius: 10px;
      width: 36px;
      height: 36px;
      cursor: pointer;
      font-size: 1rem;
      line-height: 1;
    }

    .title {
      margin: 0;
      font-size: 1.15rem;
      line-height: 1.2;
      letter-spacing: 0.015em;
    }

    .subtitle {
      margin: 4px 0 0;
      color: rgba(216, 230, 255, 0.78);
      font-size: 0.9rem;
    }

    .breadcrumbs {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      color: rgba(216, 230, 255, 0.72);
      font-size: 0.82rem;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }

    .breadcrumbs a {
      color: #8ad7ff;
      text-decoration: none;
    }

    .content {
      min-width: 0;
      padding: 18px;
    }

    .collapsed .brand-meta,
    .collapsed .label,
    .collapsed .child-list {
      display: none;
    }

    .collapsed .brand {
      padding-bottom: 6px;
    }

    @media (max-width: 920px) {
      .frame {
        grid-template-columns: minmax(0, 1fr);
      }

      .sidebar {
        position: static;
        height: auto;
        border-right: 0;
        border-bottom: 1px solid rgba(175, 196, 255, 0.16);
      }

      .collapsed .brand-meta,
      .collapsed .label,
      .collapsed .child-list {
        display: block;
      }
    }
  `;

  @property({ attribute: false }) shell: DashboardShell = createDefaultShell();
  @property({ type: String }) currentPath = "/";

  private readonly iconFallbacks: Record<string, string> = {
    home: "HM",
    play: "RN",
    "check-circle": "AP",
    "git-branch": "WF",
    puzzle: "SK",
    wrench: "TL",
    lock: "SC",
    settings: "ST",
  };

  private readonly toggleSidebar = (): void => {
    this.dispatchEvent(
      new CustomEvent("dashboard:toggle-sidebar", {
        bubbles: true,
        composed: true,
      }),
    );

    this.shell = {
      ...this.shell,
      sidebar: {
        ...this.shell.sidebar,
        collapsed: !this.shell.sidebar.collapsed,
      },
    };
  };

  private navigate(event: Event, href: string, disabled = false): void {
    event.preventDefault();
    if (disabled) {
      return;
    }

    this.dispatchEvent(
      new CustomEvent("dashboard:navigate", {
        detail: { href },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private isActive(item: NavigationItem): boolean {
    if (this.shell.sidebar.activeItemId === item.id) {
      return true;
    }

    const children = item.children ?? [];
    return children.some((child) => this.isActive(child));
  }

  private renderNavItem(item: NavigationItem): unknown {
    const active = this.isActive(item);
    const disabled = item.disabled === true;
    const classes = ["nav-link", active ? "active" : "", disabled ? "disabled" : ""]
      .filter(Boolean)
      .join(" ");

    const iconText = item.icon ? (this.iconFallbacks[item.icon] ?? "--") : "--";

    return html`
      <li>
        <a
          class=${classes}
          href=${item.href}
          @click=${(event: Event) => this.navigate(event, item.href, disabled)}
          aria-disabled=${disabled ? "true" : "false"}
        >
          <span class="icon" aria-hidden="true">${iconText}</span>
          <span class="label">${item.label}</span>
        </a>
        ${
          item.children && item.children.length
            ? html`<ul class="child-list">${item.children.map((child) => this.renderNavItem(child))}</ul>`
            : nothing
        }
      </li>
    `;
  }

  override render() {
    const collapsed = this.shell.sidebar.collapsed;
    const width = collapsed
      ? this.shell.sidebar.collapsedWidthPx
      : this.shell.sidebar.expandedWidthPx;
    const frameClass = collapsed ? "frame collapsed" : "frame";

    return html`
      <div class=${frameClass} style=${`--sidebar-width:${width}px`}>
        <aside class="sidebar" aria-label="Dashboard navigation">
          <div class="brand">
            <span class="brand-title">OpenClaw</span>
            <span class="brand-meta">Dashboard MVP</span>
          </div>
          <ul class="nav-list">${this.shell.sidebar.items.map((item) => this.renderNavItem(item))}</ul>
        </aside>

        <section class="chrome">
          <header class="topbar">
            <div class="topbar-header">
              <button class="toggle" type="button" @click=${this.toggleSidebar} aria-label="Toggle sidebar">
                ${collapsed ? ">" : "<"}
              </button>
              <div>
                <h1 class="title">${this.shell.pageTitle}</h1>
                ${
                  this.shell.pageSubtitle
                    ? html`<p class="subtitle">${this.shell.pageSubtitle}</p>`
                    : nothing
                }
              </div>
            </div>
            <nav class="breadcrumbs" aria-label="Breadcrumb">
              ${this.shell.breadcrumbs.map((crumb, index) => {
                const divider =
                  index > 0
                    ? html`
                        <span>/</span>
                      `
                    : nothing;
                const content = crumb.href
                  ? html`<a href=${crumb.href} @click=${(event: Event) => this.navigate(event, crumb.href!)}>${crumb.label}</a>`
                  : html`<span>${crumb.label}</span>`;
                return html`${divider}${content}`;
              })}
            </nav>
          </header>
          <main class="content">
            <slot></slot>
          </main>
        </section>
      </div>
    `;
  }
}
