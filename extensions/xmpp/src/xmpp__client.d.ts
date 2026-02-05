/**
 * Type declarations for @xmpp/client
 * https://github.com/xmppjs/xmpp.js
 */
declare module "@xmpp/client" {
  import type { EventEmitter } from "node:events";

  export interface ClientOptions {
    service: string;
    domain?: string;
    resource?: string;
    username?: string;
    password?: string;
  }

  export interface XMLElement {
    append(child: XMLElement): void;
    is(name: string): boolean;
    attrs: Record<string, string>;
    getChild(name: string, xmlns?: string): XMLElement | undefined;
    getChildren(name: string, xmlns?: string): XMLElement[];
    getText(): string;
  }

  export interface IQCaller {
    request(iq: XMLElement): Promise<XMLElement>;
  }

  export interface XMPPClient extends EventEmitter {
    start(): Promise<void>;
    stop(): Promise<void>;
    send(stanza: XMLElement): Promise<void>;
    iqCaller: IQCaller;
    on(event: "online", listener: (address: unknown) => void): this;
    on(event: "offline", listener: () => void): this;
    on(event: "stanza", listener: (stanza: XMLElement) => void): this;
    on(event: "error", listener: (error: Error) => void): this;
    on(event: "status", listener: (status: string) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
    removeListener(event: string, listener: (...args: unknown[]) => void): this;
    removeAllListeners(event?: string): this;
  }

  export function client(options: ClientOptions): XMPPClient;

  export function xml(
    name: string,
    attrs?: Record<string, string | number>,
    ...children: unknown[]
  ): XMLElement;
}
