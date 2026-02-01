import type {
  InterceptorEventCallback,
  InterceptorName,
  InterceptorRegistration,
} from "./types.js";
import { KNOWN_TOOL_NAMES } from "./types.js";

// Internal storage uses the base union type
type AnyInterceptorRegistration = InterceptorRegistration;

/**
 * Validate that a toolMatcher regex can match at least one known tool name.
 * Throws if the regex cannot match any known tool, preventing silent misconfigurations.
 */
function validateToolMatcher(id: string, matcher: RegExp): void {
  const matchesAny = [...KNOWN_TOOL_NAMES].some((name) => {
    matcher.lastIndex = 0;
    return matcher.test(name);
  });
  if (!matchesAny) {
    throw new Error(
      `Interceptor "${id}": toolMatcher ${matcher} does not match any known tool name. ` +
        `Known tools: ${[...KNOWN_TOOL_NAMES].join(", ")}`,
    );
  }
}

export function createInterceptorRegistry() {
  const entries: AnyInterceptorRegistration[] = [];
  let onEvent: InterceptorEventCallback | null = null;

  return {
    add<N extends InterceptorName>(reg: InterceptorRegistration<N>): void {
      if (reg.toolMatcher) {
        validateToolMatcher(reg.id, reg.toolMatcher);
      }
      // Cast is safe: we store the narrowed registration in the union-typed array.
      // TypeScript cannot prove handler contravariance here, but the trigger function
      // always calls handlers with the correct input/output types for the given name.
      entries.push(reg as unknown as AnyInterceptorRegistration);
    },

    remove(id: string): void {
      const idx = entries.findIndex((e) => e.id === id);
      if (idx !== -1) {
        entries.splice(idx, 1);
      }
    },

    get(name: InterceptorName, matchContext?: string): AnyInterceptorRegistration[] {
      return entries
        .filter((e) => {
          if (e.name !== name) {
            return false;
          }
          if (matchContext) {
            // Tool events use toolMatcher, message/params events use agentMatcher
            if (name === "tool.before" || name === "tool.after") {
              if (e.toolMatcher && !e.toolMatcher.test(matchContext)) {
                return false;
              }
            } else {
              if (e.agentMatcher && !e.agentMatcher.test(matchContext)) {
                return false;
              }
            }
          }
          return true;
        })
        .toSorted((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    },

    list(): AnyInterceptorRegistration[] {
      return entries.slice();
    },

    clear(): void {
      entries.length = 0;
    },

    setOnEvent(cb: InterceptorEventCallback | null): void {
      onEvent = cb;
    },

    getOnEvent(): InterceptorEventCallback | null {
      return onEvent;
    },
  };
}

export type InterceptorRegistry = ReturnType<typeof createInterceptorRegistry>;
