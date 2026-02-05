/**
 * In-process gateway service registry.
 *
 * When the gateway starts, it registers core services here so that agent tools
 * running in the same process can call them directly — without opening a new
 * WebSocket connection to themselves.
 *
 * This eliminates the self-contention timeout that occurs when a tool tries to
 * open a WS to a gateway that's busy processing the current agent turn.
 */

import type { CronService } from "../cron/service.js";

export interface InProcessServices {
  cron: CronService;
  cronStorePath: string;
}

let _services: InProcessServices | undefined;

/**
 * Register gateway services for in-process tool access.
 * Called once during gateway startup (and on config reload).
 */
export function registerInProcessServices(services: InProcessServices): void {
  _services = services;
}

/**
 * Get registered in-process services, or undefined if not running inside gateway.
 * Tools should check this first and fall back to WebSocket if undefined.
 */
export function getInProcessServices(): InProcessServices | undefined {
  return _services;
}

/**
 * Clear registered services (for testing or shutdown).
 */
export function clearInProcessServices(): void {
  _services = undefined;
}
