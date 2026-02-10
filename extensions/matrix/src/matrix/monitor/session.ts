import type { MatrixSessionScope } from "../../types.js";

type MatrixRouteKeys = {
  sessionKey: string;
  mainSessionKey: string;
};

export function resolveMatrixSessionKey(params: {
  route: MatrixRouteKeys;
  sessionScope: MatrixSessionScope;
  isDirectMessage: boolean;
  threadRootId?: string | null;
}): {
  sessionKey: string;
  parentSessionKey?: string;
  isThreadSession: boolean;
} {
  const { route, sessionScope, isDirectMessage } = params;
  const threadRootId = (params.threadRootId ?? "").trim();

  const baseSessionKey =
    !isDirectMessage && sessionScope === "agent" ? route.mainSessionKey : route.sessionKey;

  if (!threadRootId || isDirectMessage) {
    return {
      sessionKey: baseSessionKey,
      parentSessionKey: undefined,
      isThreadSession: false,
    };
  }

  return {
    sessionKey: `${baseSessionKey}:thread:${threadRootId}`,
    parentSessionKey: baseSessionKey,
    isThreadSession: true,
  };
}
