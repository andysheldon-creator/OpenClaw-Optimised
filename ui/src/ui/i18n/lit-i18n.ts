// Internationalization utility functions for Lit templates
import { i18n } from "./i18n-manager.js";

// Lit directive for translations
export const msg = (key: string, params?: Record<string, unknown>) => {
  let translation = i18n.t(key);

  // If params are provided, perform simple interpolation
  if (params) {
    Object.entries(params).forEach(([param, value]) => {
      translation = translation.replace(`{{${param}}}`, String(value));
    });
  }

  return translation;
};

// Component for displaying localized content
export class LocalizedContent extends HTMLElement {
  private _key: string = "";
  private _params?: Record<string, unknown>;

  static get observedAttributes() {
    return ["key", "params"];
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    if (oldValue !== newValue) {
      switch (name) {
        case "key":
          this._key = newValue || "";
          break;
        case "params":
          try {
            this._params = newValue ? JSON.parse(newValue) : undefined;
          } catch (e) {
            console.warn("Invalid params attribute:", e);
          }
          break;
      }
      this.render();
    }
  }

  private boundRender = this.render.bind(this);

  connectedCallback() {
    this.render();

    // Listen for locale changes
    window.addEventListener("localeChanged", this.boundRender);
  }

  disconnectedCallback() {
    window.removeEventListener("localeChanged", this.boundRender);
  }

  render() {
    if (!this._key) {
      return;
    }

    const translation = msg(this._key, this._params);
    this.textContent = translation;
  }
}

// Register the custom element
if (!customElements.get("localized-content")) {
  customElements.define("localized-content", LocalizedContent);
}
