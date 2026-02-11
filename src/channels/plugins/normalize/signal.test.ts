import { describe, expect, it } from "vitest";
import { looksLikeSignalTargetId, normalizeSignalMessagingTarget } from "./signal.js";

describe("signal target normalization", () => {
  it("normalizes uuid targets by stripping uuid: and preserving case", () => {
    expect(normalizeSignalMessagingTarget("uuid:123E4567-E89B-12D3-A456-426614174000")).toBe(
      "123E4567-E89B-12D3-A456-426614174000",
    );
  });

  it("normalizes signal:uuid targets and preserves case", () => {
    expect(normalizeSignalMessagingTarget("signal:uuid:123E4567-E89B-12D3-A456-426614174000")).toBe(
      "123E4567-E89B-12D3-A456-426614174000",
    );
  });

  it("accepts uuid prefixes for target detection", () => {
    expect(looksLikeSignalTargetId("uuid:123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    expect(looksLikeSignalTargetId("signal:uuid:123e4567-e89b-12d3-a456-426614174000")).toBe(true);
  });

  it("accepts compact UUIDs for target detection", () => {
    expect(looksLikeSignalTargetId("123e4567e89b12d3a456426614174000")).toBe(true);
    expect(looksLikeSignalTargetId("uuid:123e4567e89b12d3a456426614174000")).toBe(true);
  });

  it("rejects invalid uuid prefixes", () => {
    expect(looksLikeSignalTargetId("uuid:")).toBe(false);
    expect(looksLikeSignalTargetId("uuid:not-a-uuid")).toBe(false);
  });

  it("preserves case for group IDs (base64)", () => {
    expect(normalizeSignalMessagingTarget("group:eouKjHKHie8bH+nncebACPAD1cjJZZd46i1+pMaqnMA=")).toBe(
      "group:eouKjHKHie8bH+nncebACPAD1cjJZZd46i1+pMaqnMA=",
    );
  });

  it("preserves case for signal:group targets", () => {
    expect(normalizeSignalMessagingTarget("signal:group:eouKjHKHie8bH+nncebACPAD1cjJZZd46i1+pMaqnMA=")).toBe(
      "group:eouKjHKHie8bH+nncebACPAD1cjJZZd46i1+pMaqnMA=",
    );
  });

  it("preserves case for username targets", () => {
    expect(normalizeSignalMessagingTarget("username:SomeUser.123")).toBe(
      "username:SomeUser.123",
    );
  });

  it("preserves case for u: username shorthand", () => {
    expect(normalizeSignalMessagingTarget("u:SomeUser.123")).toBe(
      "username:SomeUser.123",
    );
  });
});
