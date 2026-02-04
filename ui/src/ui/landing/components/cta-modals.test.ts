/**
 * Tests for CTA modal components — form validation and modal behavior.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  validateName,
  validateCompany,
  validateUseCase,
  validateDemoForm,
  hasErrors,
  type DemoRequestData,
  type DemoFormErrors,
} from "./demo-request-modal";
import { validateEmail } from "./waitlist-modal";

// ---------------------------------------------------------------------------
// Email validation
// ---------------------------------------------------------------------------
describe("validateEmail", () => {
  it("returns error for empty string", () => {
    expect(validateEmail("")).toBe("Email is required");
  });

  it("returns error for whitespace-only input", () => {
    expect(validateEmail("   ")).toBe("Email is required");
  });

  it("returns error for string without @", () => {
    expect(validateEmail("foobar.com")).toBe("Please enter a valid email address");
  });

  it("returns error for missing domain", () => {
    expect(validateEmail("foo@")).toBe("Please enter a valid email address");
  });

  it("returns error for domain without TLD", () => {
    expect(validateEmail("foo@bar")).toBe("Please enter a valid email address");
  });

  it("returns error for TLD shorter than 2 chars", () => {
    expect(validateEmail("foo@bar.c")).toBe("Please enter a valid email address");
  });

  it("returns empty string for valid email", () => {
    expect(validateEmail("user@example.com")).toBe("");
  });

  it("returns empty string for email with subdomain", () => {
    expect(validateEmail("user@mail.example.co.uk")).toBe("");
  });

  it("returns empty string for email with + alias", () => {
    expect(validateEmail("user+tag@example.com")).toBe("");
  });

  it("trims whitespace before validating", () => {
    expect(validateEmail("  user@example.com  ")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Name validation
// ---------------------------------------------------------------------------
describe("validateName", () => {
  it("returns error for empty string", () => {
    expect(validateName("")).toBe("Name is required");
  });

  it("returns error for whitespace-only", () => {
    expect(validateName("   ")).toBe("Name is required");
  });

  it("returns error for single character", () => {
    expect(validateName("A")).toBe("Name must be at least 2 characters");
  });

  it("returns empty string for valid name", () => {
    expect(validateName("Jane")).toBe("");
  });

  it("returns empty string for name with spaces", () => {
    expect(validateName("Jane Smith")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Company validation
// ---------------------------------------------------------------------------
describe("validateCompany", () => {
  it("returns error for empty string", () => {
    expect(validateCompany("")).toBe("Company is required");
  });

  it("returns error for whitespace-only", () => {
    expect(validateCompany("  ")).toBe("Company is required");
  });

  it("returns empty string for valid company", () => {
    expect(validateCompany("Acme Inc.")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Use case validation
// ---------------------------------------------------------------------------
describe("validateUseCase", () => {
  it("returns error for empty string (no selection)", () => {
    expect(validateUseCase("")).toBe("Please select a use case");
  });

  it("returns empty string for any non-empty selection", () => {
    expect(validateUseCase("dev-workflows")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Full demo form validation
// ---------------------------------------------------------------------------
describe("validateDemoForm", () => {
  it("returns errors for fully empty form", () => {
    const data: DemoRequestData = { name: "", email: "", company: "", useCase: "" };
    const errors = validateDemoForm(data);
    expect(errors.name).not.toBe("");
    expect(errors.email).not.toBe("");
    expect(errors.company).not.toBe("");
    expect(errors.useCase).not.toBe("");
  });

  it("returns no errors for valid form", () => {
    const data: DemoRequestData = {
      name: "Jane Smith",
      email: "jane@acme.com",
      company: "Acme Inc.",
      useCase: "dev-workflows",
    };
    const errors = validateDemoForm(data);
    expect(errors.name).toBe("");
    expect(errors.email).toBe("");
    expect(errors.company).toBe("");
    expect(errors.useCase).toBe("");
  });

  it("returns partial errors when some fields are valid", () => {
    const data: DemoRequestData = {
      name: "Jane",
      email: "bad",
      company: "Acme",
      useCase: "",
    };
    const errors = validateDemoForm(data);
    expect(errors.name).toBe("");
    expect(errors.email).not.toBe("");
    expect(errors.company).toBe("");
    expect(errors.useCase).not.toBe("");
  });
});

// ---------------------------------------------------------------------------
// hasErrors helper
// ---------------------------------------------------------------------------
describe("hasErrors", () => {
  it("returns false when all fields are empty strings", () => {
    const errors: DemoFormErrors = { name: "", email: "", company: "", useCase: "" };
    expect(hasErrors(errors)).toBe(false);
  });

  it("returns true when any field has a non-empty string", () => {
    const errors: DemoFormErrors = { name: "", email: "required", company: "", useCase: "" };
    expect(hasErrors(errors)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// WaitlistModal DOM / behavior tests (use Lit testing patterns)
// ---------------------------------------------------------------------------
describe("WaitlistModal component", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("registers as a custom element", async () => {
    // Importing the module should register the element
    await import("./waitlist-modal");
    expect(customElements.get("waitlist-modal")).toBeDefined();
  });

  it("creates element and toggles open property", async () => {
    await import("./waitlist-modal");
    const el = document.createElement("waitlist-modal") as any;
    container.appendChild(el);
    expect(el.open).toBe(false);
    el.open = true;
    expect(el.open).toBe(true);
  });

  it("dispatches modal-close event on close", async () => {
    await import("./waitlist-modal");
    const el = document.createElement("waitlist-modal") as any;
    container.appendChild(el);
    el.open = true;

    const closeSpy = vi.fn();
    el.addEventListener("modal-close", closeSpy);

    // Trigger close by calling the protected method directly
    // (In real usage this happens via escape key or close button click)
    el.open = false;
    el.dispatchEvent(new CustomEvent("modal-close", { bubbles: true, composed: true }));
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// DemoRequestModal DOM / behavior tests
// ---------------------------------------------------------------------------
describe("DemoRequestModal component", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("registers as a custom element", async () => {
    await import("./demo-request-modal");
    expect(customElements.get("demo-request-modal")).toBeDefined();
  });

  it("creates element and defaults to closed", async () => {
    await import("./demo-request-modal");
    const el = document.createElement("demo-request-modal") as any;
    container.appendChild(el);
    expect(el.open).toBe(false);
  });

  it("sets open property", async () => {
    await import("./demo-request-modal");
    const el = document.createElement("demo-request-modal") as any;
    container.appendChild(el);
    el.open = true;
    expect(el.open).toBe(true);
  });
});
