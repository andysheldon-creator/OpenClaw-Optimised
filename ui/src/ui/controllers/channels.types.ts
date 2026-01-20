import type { GatewayBrowserClient } from "../gateway";
import type { ChannelsStatusSnapshot, NostrProfile } from "../types";

export type ChannelsState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  channelsLoading: boolean;
  channelsSnapshot: ChannelsStatusSnapshot | null;
  channelsError: string | null;
  channelsLastSuccess: number | null;
  whatsappLoginMessage: string | null;
  whatsappLoginQrDataUrl: string | null;
  whatsappLoginConnected: boolean | null;
  whatsappBusy: boolean;
  // Nostr profile editing
  nostrProfileEditing: boolean;
  nostrProfileForm: NostrProfile | null;
  nostrProfileSaving: boolean;
  nostrProfileImporting: boolean;
  nostrProfileError: string | null;
  nostrProfileSuccess: string | null;
};
