import { LitElement, css, html, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("dashboard-detail-drawer")
export class DashboardDetailDrawer extends LitElement {
  static override styles = css`
    :host {
      position: fixed;
      inset: 0;
      z-index: 24;
      pointer-events: none;
      font-family: var(--font-ui, "Space Grotesk", sans-serif);
    }

    .overlay {
      position: absolute;
      inset: 0;
      background: rgba(2, 6, 14, 0.68);
      opacity: 0;
      transition: opacity 140ms ease;
    }

    .panel {
      position: absolute;
      inset: 0 0 0 auto;
      width: var(--drawer-width, 440px);
      max-width: 100%;
      background:
        linear-gradient(160deg, rgba(14, 165, 233, 0.12), transparent 42%), rgba(10, 17, 35, 0.98);
      border-left: 1px solid rgba(175, 196, 255, 0.24);
      transform: translateX(100%);
      transition: transform 160ms ease;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      color: #f4f7ff;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 14px 16px;
      border-bottom: 1px solid rgba(175, 196, 255, 0.22);
    }

    h2 {
      margin: 0;
      font-size: 1.02rem;
      font-weight: 640;
      letter-spacing: 0.01em;
    }

    .close {
      border: 1px solid rgba(175, 196, 255, 0.28);
      background: rgba(18, 29, 57, 0.84);
      color: #ecf4ff;
      border-radius: 10px;
      width: 34px;
      height: 34px;
      cursor: pointer;
      font-size: 1rem;
      line-height: 1;
    }

    .body {
      overflow: auto;
      padding: 16px;
    }

    .open {
      pointer-events: auto;
    }

    .open .overlay {
      opacity: 1;
    }

    .open .panel {
      transform: translateX(0);
    }

    @media (max-width: 760px) {
      .panel {
        width: min(100%, var(--drawer-width, 440px));
      }
    }
  `;

  @property({ type: Boolean }) open = false;
  @property({ type: Number }) widthPx = 440;
  @property({ type: String }) title = "Details";

  private readonly close = (): void => {
    this.dispatchEvent(
      new CustomEvent("dashboard:drawer-close", {
        bubbles: true,
        composed: true,
      }),
    );
  };

  override render() {
    const hostClass = this.open ? "open" : "";
    return html`
      <div class=${hostClass}>
        ${
          this.open
            ? html`
              <button class="overlay" type="button" @click=${this.close} aria-label="Close detail drawer"></button>
              <aside class="panel" style=${`--drawer-width:${this.widthPx}px`} aria-label=${this.title}>
                <header class="header">
                  <h2>${this.title}</h2>
                  <button class="close" type="button" @click=${this.close} aria-label="Close">x</button>
                </header>
                <section class="body">
                  <slot></slot>
                </section>
              </aside>
            `
            : nothing
        }
      </div>
    `;
  }
}
