/**
 * Type-safe process signal handling wrapper.
 * Works around TypeScript type resolution issues with process.on/removeListener
 * when using @types/node v25+ with NodeNext module resolution.
 */

type SignalHandler = () => void;

// Use unknown cast to work around TypeScript module resolution bug where
// process.on types incorrectly resolve to only allow "loaded" as event name.
// biome-ignore lint/suspicious/noExplicitAny: Required workaround for @types/node v25 type resolution bug
const proc = process as any;

export function onSignal(signal: NodeJS.Signals, handler: SignalHandler): void {
  proc.on(signal, handler);
}

export function removeSignalListener(
  signal: NodeJS.Signals,
  handler: SignalHandler,
): void {
  proc.removeListener(signal, handler);
}

export function onceSignal(
  signal: NodeJS.Signals,
  handler: SignalHandler,
): void {
  proc.once(signal, handler);
}

// Process event handlers
type UnhandledRejectionHandler = (
  reason: unknown,
  promise: Promise<unknown>,
) => void;
type UncaughtExceptionHandler = (error: Error) => void;

export function onUnhandledRejection(handler: UnhandledRejectionHandler): void {
  proc.on("unhandledRejection", handler);
}

export function onUncaughtException(handler: UncaughtExceptionHandler): void {
  proc.on("uncaughtException", handler);
}
