/**
 * Type declarations for @xmpp/jid
 * https://github.com/xmppjs/xmpp.js
 */
declare module "@xmpp/jid" {
  export class JID {
    constructor(local?: string, domain?: string, resource?: string);
    toString(): string;
    bare(): JID;
    equals(other: JID): boolean;
    local: string;
    domain: string;
    resource: string;
  }

  export function jid(local?: string, domain?: string, resource?: string): JID;
  export function jid(address: string): JID;
}
