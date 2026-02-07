import type { Api, Model } from "@mariozechner/pi-ai";

function isOpenAiCompletionsModel(model: Model<Api>): model is Model<"openai-completions"> {
  return model.api === "openai-completions";
}

export function normalizeModelCompat(model: Model<Api>): Model<Api> {
  const baseUrl = model.baseUrl ?? "";
  const isZai = model.provider === "zai" || baseUrl.includes("api.z.ai");
  const isBailian = model.provider === "bailian" || baseUrl.includes("dashscope.aliyuncs.com");

  if ((!isZai && !isBailian) || !isOpenAiCompletionsModel(model)) {
    return model;
  }

  const openaiModel = model;
  const compat = openaiModel.compat ?? undefined;
  if (compat?.supportsDeveloperRole === false) {
    return model;
  }

  if (isZai) {
    openaiModel.compat = compat
      ? { ...compat, supportsDeveloperRole: false }
      : { supportsDeveloperRole: false };
  } else if (isBailian) {
    openaiModel.compat = compat
      ? { ...compat, supportsDeveloperRole: false, thinkingFormat: "qwen" }
      : { supportsDeveloperRole: false, thinkingFormat: "qwen" };
  }
  return openaiModel;
}
