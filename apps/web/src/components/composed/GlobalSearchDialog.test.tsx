import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useGlobalSearchDialog } from "./GlobalSearchDialog";
import { renderHook, act } from "@testing-library/react";

// Test the keyboard shortcut hook separately since the dialog
// requires router context and complex data providers
describe("useGlobalSearchDialog", () => {
  it("initializes with closed state", () => {
    const { result } = renderHook(() => useGlobalSearchDialog());
    expect(result.current.open).toBe(false);
  });

  it("toggles on setOpen(true)", () => {
    const { result } = renderHook(() => useGlobalSearchDialog());

    act(() => {
      result.current.setOpen(true);
    });

    expect(result.current.open).toBe(true);
  });

  it("closes on setOpen(false)", () => {
    const { result } = renderHook(() => useGlobalSearchDialog());

    act(() => {
      result.current.setOpen(true);
    });
    expect(result.current.open).toBe(true);

    act(() => {
      result.current.setOpen(false);
    });
    expect(result.current.open).toBe(false);
  });

  it("responds to Cmd+Shift+F keyboard shortcut", () => {
    const { result } = renderHook(() => useGlobalSearchDialog());

    act(() => {
      const event = new KeyboardEvent("keydown", {
        key: "f",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      });
      document.dispatchEvent(event);
    });

    expect(result.current.open).toBe(true);
  });

  it("toggles off on second Cmd+Shift+F", () => {
    const { result } = renderHook(() => useGlobalSearchDialog());

    // Open
    act(() => {
      const event = new KeyboardEvent("keydown", {
        key: "f",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      });
      document.dispatchEvent(event);
    });
    expect(result.current.open).toBe(true);

    // Close
    act(() => {
      const event = new KeyboardEvent("keydown", {
        key: "f",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
      });
      document.dispatchEvent(event);
    });
    expect(result.current.open).toBe(false);
  });

  it("responds to Ctrl+Shift+F keyboard shortcut", () => {
    const { result } = renderHook(() => useGlobalSearchDialog());

    act(() => {
      const event = new KeyboardEvent("keydown", {
        key: "f",
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      });
      document.dispatchEvent(event);
    });

    expect(result.current.open).toBe(true);
  });

  it("does not respond to plain F key", () => {
    const { result } = renderHook(() => useGlobalSearchDialog());

    act(() => {
      const event = new KeyboardEvent("keydown", {
        key: "f",
        bubbles: true,
      });
      document.dispatchEvent(event);
    });

    expect(result.current.open).toBe(false);
  });

  it("does not respond to Cmd+F (without Shift)", () => {
    const { result } = renderHook(() => useGlobalSearchDialog());

    act(() => {
      const event = new KeyboardEvent("keydown", {
        key: "f",
        metaKey: true,
        bubbles: true,
      });
      document.dispatchEvent(event);
    });

    expect(result.current.open).toBe(false);
  });

  it("cleans up event listener on unmount", () => {
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const { unmount } = renderHook(() => useGlobalSearchDialog());

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    removeSpy.mockRestore();
  });
});
