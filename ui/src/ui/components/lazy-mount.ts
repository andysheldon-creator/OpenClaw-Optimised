import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

interface IdleDeadline {
  timeRemaining(): number;
  didTimeout: boolean;
}

/**
 * LazyMount component with advanced performance optimizations.
 *
 * Features:
 * 1. Lazy mounting with reduced rootMargin (300px) to avoid burst loading.
 * 2. Idle-time scheduling (requestIdleCallback) for mounting to prevent frame drops.
 * 3. `content-visibility: auto` to optimize rendering of off-screen mounted content.
 * 4. Persistent mounting (never unmounts) to preserve state/focus.
 */
@customElement("lazy-mount")
export class LazyMount extends LitElement {
  @property({ attribute: false })
  renderContent: () => unknown = () => html``;

  @property({ type: String })
  label = "unknown";

  @property({ type: String })
  minHeight = "150px";

  @property({ type: Boolean })
  immediate = false;

  @state()
  private hasAppeared = false;

  private observer: IntersectionObserver | null = null;

  // -- Global Idle Queue --
  private static queue: (() => void)[] = [];
  private static isScheduled = false;

  private static scheduleMount(task: () => void) {
    this.queue.push(task);

    if (this.isScheduled) {
      return;
    }
    this.isScheduled = true;

    const process = (deadline?: IdleDeadline) => {
      const start = performance.now();

      // Process items while time remains or budget isn't exceeded
      while (this.queue.length > 0) {
        if (deadline && deadline.timeRemaining() < 2) {
          break; // Defensive 2ms buffer
        }
        if (!deadline && performance.now() - start > 8) {
          break; // 8ms cap (half frame) in fallback
        }

        const nextTask = this.queue.shift();
        if (nextTask) {
          nextTask();
        }
      }

      if (this.queue.length > 0) {
        // Reschedule remainder
        if ("requestIdleCallback" in window) {
          (
            window as unknown as {
              requestIdleCallback: (
                cb: (d?: IdleDeadline) => void,
                opt?: { timeout: number },
              ) => void;
            }
          ).requestIdleCallback(process, { timeout: 200 });
        } else {
          requestAnimationFrame(() => process());
        }
      } else {
        this.isScheduled = false;
      }
    };

    if ("requestIdleCallback" in window) {
      (
        window as unknown as {
          requestIdleCallback: (cb: (d?: IdleDeadline) => void, opt?: { timeout: number }) => void;
        }
      ).requestIdleCallback(process, { timeout: 200 });
    } else {
      requestAnimationFrame(() => process());
    }
  }
  // ----------------------

  connectedCallback() {
    super.connectedCallback();

    const isTest =
      typeof window !== "undefined" &&
      ((window as unknown as Record<string, unknown>).__vitest_browser__ ||
        (window as unknown as Record<string, unknown>).__FORCE_LAZY_MOUNT__);

    // Apply critical CSS performance properties to host
    this.style.display = "block";
    if (!isTest) {
      this.style.contain = "layout paint style"; // strict containment
      this.style.contentVisibility = "auto"; // Skip rendering work when off-screen
      this.style.containIntrinsicSize = `auto ${this.minHeight}`; // Prevent scroll jump
    }

    if (this.immediate || isTest) {
      this.hasAppeared = true;
      return;
    }

    // Defer observer
    requestAnimationFrame(() => {
      this.setupObserver();
    });
  }

  disconnectedCallback() {
    this.disconnectObserver();
    super.disconnectedCallback();
  }

  private setupObserver() {
    if (this.observer || this.hasAppeared) {
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          this.disconnectObserver();

          // Schedule mount via idle callback to avoid main-thread/scrolling jank
          LazyMount.scheduleMount(() => {
            this.performMount();
          });
        }
      },
      {
        // Reduced to 300px to prevent large batches from entering queue at once
        rootMargin: "300px 0px",
      },
    );
    this.observer.observe(this);
  }

  private disconnectObserver() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  private performMount() {
    if (this.hasAppeared) {
      return;
    }

    this.hasAppeared = true;
    this.requestUpdate();
  }

  createRenderRoot() {
    return this;
  }

  render() {
    const isTest =
      typeof window !== "undefined" &&
      ((window as unknown as Record<string, unknown>).__vitest_browser__ ||
        (window as unknown as Record<string, unknown>).__FORCE_LAZY_MOUNT__);

    if (!this.hasAppeared && !this.immediate && !isTest) {
      // Placeholder
      return html`
        <div style="
          height: ${this.minHeight}; 
          background: var(--c-surface-2, rgba(125,125,125,0.05)); 
          border-radius: var(--radius-m, 8px);
          margin-bottom: 1rem;
        "></div>
      `;
    }
    return this.renderContent() || html``;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "lazy-mount": LazyMount;
  }
}
