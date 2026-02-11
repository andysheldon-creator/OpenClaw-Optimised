import { describe, expect, it } from "vitest";
import { extractZulipTopicDirective } from "./directives.js";

describe("extractZulipTopicDirective", () => {
  it("extracts a topic override and strips the directive", () => {
    const r = extractZulipTopicDirective("hello [[zulip_topic: Alerts]] world");
    expect(r.topicOverride).toBe("Alerts");
    expect(r.text).toBe("hello  world");
  });

  it("last directive wins", () => {
    const r = extractZulipTopicDirective(
      "x [[zulip_topic: First]] y [[zulip_topic: Second]] z",
    );
    expect(r.topicOverride).toBe("Second");
    expect(r.text).toBe("x  y  z");
  });

  it("ignores empty override", () => {
    const r = extractZulipTopicDirective("x [[zulip_topic:   ]] y");
    expect(r.topicOverride).toBe(undefined);
    expect(r.text).toBe("x  y");
  });
});
