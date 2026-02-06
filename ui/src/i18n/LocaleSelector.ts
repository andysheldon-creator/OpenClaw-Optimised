import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { i18n, type Locale } from "./i18n.ts";

@customElement("locale-selector")
export class LocaleSelector extends LitElement {
  @state()
  private currentLocale: Locale = i18n.getLocale();

  connectedCallback() {
    super.connectedCallback();
    i18n.addListener(this.handleLocaleChange);
  }

  disconnectedCallback() {
    i18n.removeListener(this.handleLocaleChange);
    super.disconnectedCallback();
  }

  private handleLocaleChange = (locale: Locale) => {
    this.currentLocale = locale;
    this.requestUpdate();
  };

  private handleLocaleChangeRequest = (e: Event) => {
    const select = e.target as HTMLSelectElement;
    const newLocale = select.value as Locale;
    i18n.setLocale(newLocale);
  };

  render() {
    return html`
      <div class="locale-selector">
        <select 
          .value=${this.currentLocale}
          @change=${this.handleLocaleChangeRequest}
          aria-label="Select language"
        >
          <option value="en">English</option>
          <option value="zh-CN">简体中文</option>
        </select>
      </div>
    `;
  }

  static styles = css`
    .locale-selector {
      display: flex;
      align-items: center;
    }

    .locale-selector select {
      background: var(--bg-2);
      color: var(--fg-1);
      border: 1px solid var(--border-1);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 14px;
      cursor: pointer;
    }

    .locale-selector select:focus {
      outline: none;
      border-color: var(--accent-1);
    }
  `;
}
