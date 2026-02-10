# Hugging Face Inference Provider: Assessment and Implementation Plan

## 1. Assessment

### 1.1 Current state: Hugging Face in this repository

- **No first-class support.** There is no `huggingface` provider in the codebase. Grep for "huggingface" / "hugging" finds no provider-specific code.
- **Coverage:** Model providers are implemented via:
  - **Provider config:** `src/agents/models-config.providers.ts` — `buildXxxProvider()`, `resolveImplicitProviders()`
  - **Auth:** `src/agents/model-auth.ts` — `resolveEnvApiKey(provider)` with an `envMap` (e.g. `together: "TOGETHER_API_KEY"`)
  - **Onboarding:** `src/commands/auth-choice-options.ts`, `auth-choice.apply.api-providers.ts`, `onboard-auth.config-core.ts`, `onboard-auth.credentials.ts`
  - **Non-interactive:** `src/commands/onboard-non-interactive/local/auth-choice-inference.ts`, `local/auth-choice.ts`
  - **CLI:** `src/cli/program/register.onboard.ts` (options), `src/commands/onboard-types.ts` (OnboardOptions)
- **Custom provider workaround:** Users can today add Hugging Face Inference via **Custom Provider** (onboard “Custom Provider” or manual `models.providers`) by setting base URL `https://router.huggingface.co/v1` and API key from env/store. That does not surface Hugging Face in the onboarding list or in provider docs.

### 1.2 Hugging Face inference offerings (relevant to OpenClaw)

- **Inference Providers (serverless, recommended for first-class):**
  - Single OpenAI-compatible endpoint: `https://router.huggingface.co/v1`.
  - Auth: **Bearer token** — create a fine-grained token at [HF Settings → Tokens](https://huggingface.co/settings/tokens) with “Make calls to Inference Providers”.
  - Env var commonly used: `HF_TOKEN` (also `HUGGINGFACE_HUB_TOKEN` in some SDKs).
  - Model IDs: Hub-style `org/model` (e.g. `deepseek-ai/DeepSeek-R1`, `openai/gpt-oss-120b`). Optional suffixes `:fastest` or `:cheapest` for server-side provider selection.
  - **GET /v1/models** returns available models; no static catalog is strictly required for basic chat.
- **Inference Endpoints (dedicated):** User-deploys an endpoint; base URL is per-endpoint. Fits “custom provider” or a future “Hugging Face Endpoints” variant; out of scope for this first-class pass.
- **Legacy Serverless Inference API:** Older `api-inference`; the **Inference Providers** router is the modern, OpenAI-compatible surface.

Conclusion: First-class support should target **Hugging Face Inference (router)** at `https://router.huggingface.co/v1` with `HF_TOKEN`, OpenAI-compatible chat completions. Official docs: [Inference Providers](https://huggingface.co/docs/inference-providers), [Quicktour](https://huggingface.co/docs/api-inference/quicktour).

### 1.3 Onboarding configuration flow (inference providers)

- **Interactive:** `openclaw onboard` → wizard → `promptAuthChoiceGrouped()` (auth-choice-options) → `applyAuthChoice()` → provider-specific handler in `auth-choice.apply.api-providers.ts` (e.g. together-api-key):
  1. Prompt for API key (or use existing env).
  2. Store credential via `setXxxApiKey()` (onboard-auth.credentials).
  3. `applyAuthProfileConfig()` to point config to profile.
  4. `applyDefaultModelChoice()` with `applyXxxConfig` (sets default model) and `applyXxxProviderConfig` (writes `models.providers.<id>`).
- **Non-interactive:** `--auth-choice xxx-api-key` and `--xxx-api-key <key>`. Flags mapped in `auth-choice-inference.ts`; key applied in `onboard-non-interactive/local/auth-choice.ts` with same apply/set functions.
- **Implicit providers:** When building the model registry, `resolveImplicitProviders()` in `models-config.providers.ts` adds a provider if env or auth profile exists (e.g. `TOGETHER_API_KEY` or profile `together:default`). So we need `resolveEnvApiKey("huggingface")` and a `buildHuggingfaceProvider()` plus a branch in `resolveImplicitProviders()` for `huggingface`.

### 1.4 Gaps to make Hugging Face a first-class citizen

| Area | Gap | Required change |
|------|-----|-----------------|
| **Provider definition** | No `huggingface` provider | Add `buildHuggingfaceProvider()` and default model list; add branch in `resolveImplicitProviders()` (models-config.providers.ts). |
| **Auth** | No env mapping | Add `huggingface` → `HF_TOKEN` (and optionally `HUGGINGFACE_HUB_TOKEN`) in `resolveEnvApiKey()` (model-auth.ts). |
| **Onboarding types** | No Hugging Face choice/options | Add `huggingface-api-key` to `AuthChoice`, `huggingface` to `AuthChoiceGroupId`; add `huggingfaceApiKey?: string` to OnboardOptions. |
| **Auth choice UI** | Not in wizard | Add group + option in auth-choice-options.ts; add handler in auth-choice.apply.api-providers.ts. |
| **Config apply** | No apply functions | Add `applyHuggingfaceConfig`, `applyHuggingfaceProviderConfig` (onboard-auth.config-core or new file), and `setHuggingfaceApiKey` (onboard-auth.credentials). |
| **Credentials** | No setter | Implement `setHuggingfaceApiKey()` and export from onboard-auth.ts. |
| **Default model ref** | None | Define `HUGGINGFACE_DEFAULT_MODEL_REF` (e.g. `huggingface/deepseek-ai/DeepSeek-R1`) and optional catalog. |
| **Preferred provider** | Not mapped | Add `huggingface-api-key` → `huggingface` in auth-choice.preferred-provider.ts. |
| **Non-interactive** | No flag/handling | Add `huggingfaceApiKey` to AuthChoiceFlagOptions and AUTH_CHOICE_FLAG_MAP; handle `huggingface-api-key` in auth-choice.ts (non-interactive). |
| **CLI** | No option | Add `--huggingface-api-key <key>` and list `huggingface-api-key` in `--auth-choice` help (register.onboard.ts). |
| **Docs** | No provider page | Add docs/providers/huggingface.md; link from docs/providers/index.md and concepts/model-providers.md. |
| **Labeler** | Optional | Add provider label in .github/labeler.yml if desired. |

---

## 2. Implementation Plan

### Project A: Core provider and auth

**Goal:** OpenClaw can resolve and use a `huggingface` provider with `HF_TOKEN` or auth profile, and merge it into the model registry when credentials exist.

| # | Activity | File-level task | Line-level subtasks |
|---|----------|-----------------|---------------------|
| A1 | Add Hugging Face env mapping | `src/agents/model-auth.ts` | In `resolveEnvApiKey()`, add branch or entry for normalized `huggingface`: pick `HF_TOKEN` then `HUGGINGFACE_HUB_TOKEN` (or add to envMap: `huggingface: "HF_TOKEN"`). |
| A2 | Define HF base URL and default model/catalog | New file `src/agents/huggingface-models.ts` (or inline in models-config.providers) | Define `HUGGINGFACE_BASE_URL = "https://router.huggingface.co/v1"`. Define a small default model list (e.g. DeepSeek-R1, Llama-3.3-70B, gpt-oss-120b) with ids, names, contextWindow, maxTokens, cost; export `buildHuggingfaceModelDefinition()` and default model ref. |
| A3 | Register provider and implicit resolution | `src/agents/models-config.providers.ts` | Add `buildHuggingfaceProvider()` returning baseUrl, api: "openai-completions", models from catalog. In `resolveImplicitProviders()`, resolve key via `resolveEnvApiKeyVarName("huggingface")` and `resolveApiKeyFromProfiles(..., "huggingface")`; if present, set `providers.huggingface = { ...buildHuggingfaceProvider(), apiKey }`. |

### Project B: Onboarding (interactive + config apply)

**Goal:** Users can choose “Hugging Face” in the onboarding wizard and have config + auth profile written correctly.

| # | Activity | File-level task | Line-level subtasks |
|---|----------|-----------------|---------------------|
| B1 | Auth choice types and options | `src/commands/onboard-types.ts` | Add `huggingface-api-key` to union type `AuthChoice`. Add `huggingface` to `AuthChoiceGroupId`. Add `huggingfaceApiKey?: string` to `OnboardOptions`. |
| B2 | Auth choice groups and option label | `src/commands/auth-choice-options.ts` | In `AUTH_CHOICE_GROUP_DEFS`, add group `{ value: "huggingface", label: "Hugging Face", hint: "Inference API (HF token)", choices: ["huggingface-api-key"] }`. In `buildAuthChoiceOptions()`, add option `{ value: "huggingface-api-key", label: "Hugging Face API key (HF token)", hint: "Inference Providers" }`. |
| B3 | Preferred provider mapping | `src/commands/auth-choice.preferred-provider.ts` | Add `"huggingface-api-key": "huggingface"` to `PREFERRED_PROVIDER_BY_AUTH_CHOICE`. |
| B4 | Credential setter | `src/commands/onboard-auth.credentials.ts` | Add `setHuggingfaceApiKey(key, agentDir?)` (upsert profile `huggingface:default`, provider `huggingface`, type api_key). Export constant `HUGGINGFACE_DEFAULT_MODEL_REF` from credentials or a shared constants file (e.g. onboard-auth.credentials.ts). |
| B5 | Config apply (provider + default model) | `src/commands/onboard-auth.config-core.ts` (or new `onboard-auth.config-huggingface.ts`) | Add `applyHuggingfaceProviderConfig(cfg)`: set `models.providers.huggingface` with baseUrl, api, models from huggingface-models, preserve apiKey from config. Add `applyHuggingfaceConfig(cfg)`: call applyHuggingfaceProviderConfig then set `agents.defaults.model.primary` to `HUGGINGFACE_DEFAULT_MODEL_REF`. Export both; ensure default model ref and catalog are imported (from huggingface-models + credentials). |
| B6 | Apply handler in wizard | `src/commands/auth-choice.apply.api-providers.ts` | Add block for `authChoice === "huggingface-api-key"`: prompt for key (or use existing env `HF_TOKEN`), call `setHuggingfaceApiKey`, `applyAuthProfileConfig` for `huggingface:default`, then `applyDefaultModelChoice` with `applyHuggingfaceConfig`, `applyHuggingfaceProviderConfig`, `HUGGINGFACE_DEFAULT_MODEL_REF`. Add tokenProvider branch in apiKey block if needed (e.g. `opts.tokenProvider === "huggingface"` → `huggingface-api-key`). |
| B7 | Export from onboard-auth | `src/commands/onboard-auth.ts` | Export `setHuggingfaceApiKey`, `applyHuggingfaceConfig`, `applyHuggingfaceProviderConfig`, and `HUGGINGFACE_DEFAULT_MODEL_REF` (if not already from credentials). |

### Project C: Non-interactive onboarding and CLI

**Goal:** `openclaw onboard --non-interactive --auth-choice huggingface-api-key --huggingface-api-key <key>` works.

| # | Activity | File-level task | Line-level subtasks |
|---|----------|-----------------|---------------------|
| C1 | Flag inference | `src/commands/onboard-non-interactive/local/auth-choice-inference.ts` | Add `huggingfaceApiKey` to `AuthChoiceFlagOptions` (Pick from OnboardOptions). Add `{ flag: "huggingfaceApiKey", authChoice: "huggingface-api-key", label: "--huggingface-api-key" }` to `AUTH_CHOICE_FLAG_MAP`. |
| C2 | Non-interactive auth handler | `src/commands/onboard-non-interactive/local/auth-choice.ts` | Add block for `authChoice === "huggingface-api-key"`: `resolveNonInteractiveApiKey` (provider `huggingface`, flagValue `opts.huggingfaceApiKey`, envVar `HF_TOKEN`), then `setHuggingfaceApiKey`, `applyAuthProfileConfig`, `applyHuggingfaceConfig`. Import setHuggingfaceApiKey and applyHuggingfaceConfig. |
| C3 | CLI option and help | `src/cli/program/register.onboard.ts` | Add `.option("--huggingface-api-key <key>", "Hugging Face API key (HF token)")`. In the options object passed to the command, add `huggingfaceApiKey: opts.huggingfaceApiKey`. Update `--auth-choice` description to include `huggingface-api-key`. |

### Project D: Documentation and discoverability

**Goal:** Users see Hugging Face in the provider list and can follow a dedicated doc.

| # | Activity | File-level task | Line-level subtasks |
|---|----------|-----------------|---------------------|
| D1 | Provider doc | `docs/providers/huggingface.md` | New file: summary, read_when, title; explain Inference Providers (router), auth (HF token, fine-grained), env `HF_TOKEN`; quick start with `openclaw onboard --auth-choice huggingface-api-key` and default model example; non-interactive example; note on GET /v1/models and model IDs (org/model, :fastest/:cheapest). |
| D2 | Provider index | `docs/providers/index.md` | Add list item: [Hugging Face (Inference)](/providers/huggingface). |
| D3 | Concepts | `docs/concepts/model-providers.md` | Add short subsection or bullet for Hugging Face: provider `huggingface`, auth `HF_TOKEN`, example model ref, CLI `openclaw onboard --auth-choice huggingface-api-key`. |
| D4 | Optional labeler | `.github/labeler.yml` | Add rule for provider/huggingface if repo uses labeler for providers. |

### Project E: Tests and polish

| # | Activity | File-level task | Line-level subtasks |
|---|----------|-----------------|---------------------|
| E1 | Model auth | `src/agents/model-auth.test.ts` | Add test that `resolveEnvApiKey("huggingface")` returns value when `HF_TOKEN` (or chosen env) is set. |
| E2 | Implicit provider | Optional test in `models-config.providers.test.ts` or similar | When env or profile has huggingface key, `resolveImplicitProviders()` includes `huggingface` provider. |
| E3 | Lint/format | All touched files | Run `pnpm check`; fix any lint/format issues. |

### Project F: Model discovery (implemented)

| # | Activity | File-level task | Line-level subtasks |
|---|----------|-----------------|---------------------|
| F1 | Discovery function | `src/agents/huggingface-models.ts` | Add `discoverHuggingfaceModels(apiKey)`: in test env or empty key return static catalog; else GET `HUGGINGFACE_BASE_URL/models` with Bearer token, 10s timeout; parse OpenAI-style `data[]`; merge with static catalog (catalog wins for known ids); on error return static catalog. Infer name/reasoning from id for unknown models. |
| F2 | Provider uses discovery | `src/agents/models-config.providers.ts` | Make `buildHuggingfaceProvider(apiKey?)` async; when resolved apiKey present call `discoverHuggingfaceModels(secret)` (resolve env var name to value for GET); else use static catalog. In `resolveImplicitProviders` await `buildHuggingfaceProvider(huggingfaceKey)`. |
| F3 | Tests | `src/agents/huggingface-models.test.ts` | Test empty key and VITEST path return static catalog; test buildHuggingfaceModelDefinition. |

---

## 3. File-level summary

| File | Action |
|------|--------|
| `src/agents/model-auth.ts` | Add huggingface → HF_TOKEN in resolveEnvApiKey |
| `src/agents/huggingface-models.ts` | **New:** base URL, default model ref, small catalog, buildHuggingfaceModelDefinition |
| `src/agents/models-config.providers.ts` | buildHuggingfaceProvider; resolveImplicitProviders branch for huggingface |
| `src/commands/onboard-types.ts` | AuthChoice + AuthChoiceGroupId + OnboardOptions.huggingfaceApiKey |
| `src/commands/auth-choice-options.ts` | Group + option for Hugging Face |
| `src/commands/auth-choice.preferred-provider.ts` | huggingface-api-key → huggingface |
| `src/commands/onboard-auth.credentials.ts` | setHuggingfaceApiKey; HUGGINGFACE_DEFAULT_MODEL_REF (or import) |
| `src/commands/onboard-auth.config-core.ts` | applyHuggingfaceProviderConfig, applyHuggingfaceConfig |
| `src/commands/auth-choice.apply.api-providers.ts` | Handler for huggingface-api-key |
| `src/commands/onboard-auth.ts` | Export new fns + constant |
| `src/commands/onboard-non-interactive/local/auth-choice-inference.ts` | huggingfaceApiKey flag + map entry |
| `src/commands/onboard-non-interactive/local/auth-choice.ts` | huggingface-api-key block, imports |
| `src/cli/program/register.onboard.ts` | --huggingface-api-key option + auth-choice help |
| `docs/providers/huggingface.md` | **New** provider doc |
| `docs/providers/index.md` | Link to Hugging Face |
| `docs/concepts/model-providers.md` | Hugging Face subsection |
| `src/agents/model-auth.test.ts` | Test resolveEnvApiKey("huggingface") |

---

## 4. Out of scope (later)

- **Model discovery:** Implemented. When `HF_TOKEN` (or profile) is present, `resolveImplicitProviders` calls `discoverHuggingfaceModels` (GET /v1/models) to populate the provider catalog; static catalog is used as fallback and for known-model metadata.
- **i18n (zh-CN):** Per AGENTS.md, do not edit docs/zh-CN unless explicitly asked; pipeline will regenerate.
