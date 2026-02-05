/**
 * XEP-0030: Service Discovery
 * https://xmpp.org/extensions/xep-0030.html
 *
 * Implements disco#info and disco#items queries to discover XMPP services.
 */

export interface DiscoIdentity {
  category: string;
  type: string;
  name?: string;
}

export interface DiscoFeature {
  var: string;
}

export interface DiscoInfoResult {
  identities: DiscoIdentity[];
  features: DiscoFeature[];
}

export interface DiscoItem {
  jid: string;
  node?: string;
  name?: string;
}

export interface DiscoItemsResult {
  items: DiscoItem[];
}
