// Runtime is treated as opaque - passed in and returned without accessing properties
let xmppRuntime: unknown = null;

export function setXmppRuntime(runtime: unknown): void {
  xmppRuntime = runtime;
}

export function getXmppRuntime(): unknown {
  if (!xmppRuntime) {
    throw new Error("XMPP runtime not initialized");
  }
  return xmppRuntime;
}
