import type { Api, Model } from "@mariozechner/pi-ai";

function isOpenAiCompletionsModel(model: Model<Api>): model is Model<"openai-completions"> {
  return model.api === "openai-completions";
}

/**
 * Detect whether a model targets the Dashscope API (Alibaba Cloud).
 *
 * Dashscope serves Qwen models via an OpenAI-compatible endpoint but rejects
 * the "developer" role — only "system", "assistant", "user", "tool", and
 * "function" are accepted.  It also uses `enable_thinking` instead of
 * `reasoning_effort` for reasoning models.
 */
function isDashscope(model: Model<Api>): boolean {
  const baseUrl = model.baseUrl ?? "";
  return (
    baseUrl.includes("dashscope.aliyuncs.com") || baseUrl.includes("dashscope-intl.aliyuncs.com")
  );
}

export function normalizeModelCompat(model: Model<Api>): Model<Api> {
  if (!isOpenAiCompletionsModel(model)) {
    return model;
  }

  const baseUrl = model.baseUrl ?? "";
  const isZai = model.provider === "zai" || baseUrl.includes("api.z.ai");

  if (isZai) {
    const compat = model.compat ?? undefined;
    if (compat?.supportsDeveloperRole === false) {
      return model;
    }
    model.compat = compat
      ? { ...compat, supportsDeveloperRole: false }
      : { supportsDeveloperRole: false };
    return model;
  }

  if (isDashscope(model)) {
    const compat = model.compat ?? undefined;
    const needsDeveloperFix = compat?.supportsDeveloperRole !== false;
    const needsThinkingFix = compat?.thinkingFormat !== "qwen";
    if (!needsDeveloperFix && !needsThinkingFix) {
      return model;
    }
    model.compat = {
      ...compat,
      supportsDeveloperRole: false,
      thinkingFormat: "qwen",
    };
    return model;
  }

  return model;
}
