export type Logger = {
  trace: (module: string, ...messageOrObject: unknown[]) => void;
  debug: (module: string, ...messageOrObject: unknown[]) => void;
  info: (module: string, ...messageOrObject: unknown[]) => void;
  warn: (module: string, ...messageOrObject: unknown[]) => void;
  error: (module: string, ...messageOrObject: unknown[]) => void;
};

export function noop(): void {
  // no-op
}

export class ConsoleLogger {
  trace(module: string, ...messageOrObject: unknown[]): void {
    console.debug(`[${module}]`, ...messageOrObject);
  }

  debug(module: string, ...messageOrObject: unknown[]): void {
    console.debug(`[${module}]`, ...messageOrObject);
  }

  info(module: string, ...messageOrObject: unknown[]): void {
    console.info(`[${module}]`, ...messageOrObject);
  }

  warn(module: string, ...messageOrObject: unknown[]): void {
    console.warn(`[${module}]`, ...messageOrObject);
  }

  error(module: string, ...messageOrObject: unknown[]): void {
    console.error(`[${module}]`, ...messageOrObject);
  }
}

const defaultLogger = new ConsoleLogger();
let activeLogger: Logger = defaultLogger;

export const LogService = {
  setLogger(logger: Logger): void {
    activeLogger = logger;
  },
  trace(module: string, ...messageOrObject: unknown[]): void {
    activeLogger.trace(module, ...messageOrObject);
  },
  debug(module: string, ...messageOrObject: unknown[]): void {
    activeLogger.debug(module, ...messageOrObject);
  },
  info(module: string, ...messageOrObject: unknown[]): void {
    activeLogger.info(module, ...messageOrObject);
  },
  warn(module: string, ...messageOrObject: unknown[]): void {
    activeLogger.warn(module, ...messageOrObject);
  },
  error(module: string, ...messageOrObject: unknown[]): void {
    activeLogger.error(module, ...messageOrObject);
  },
};
