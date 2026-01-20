import type { ChannelsStatusSnapshot, NostrProfile } from "../types";
import type { ChannelsState } from "./channels.types";

export type { ChannelsState };

// Helper to get the gateway base URL from the WebSocket URL
function getHttpBaseUrl(client: { url?: string } | null): string {
  if (!client?.url) return "";
  // Convert ws://host:port to http://host:port
  return client.url.replace(/^ws(s)?:\/\//, "http$1://").replace(/\/$/, "");
}

export async function loadChannels(state: ChannelsState, probe: boolean) {
  if (!state.client || !state.connected) return;
  if (state.channelsLoading) return;
  state.channelsLoading = true;
  state.channelsError = null;
  try {
    const res = (await state.client.request("channels.status", {
      probe,
      timeoutMs: 8000,
    })) as ChannelsStatusSnapshot;
    state.channelsSnapshot = res;
    state.channelsLastSuccess = Date.now();
  } catch (err) {
    state.channelsError = String(err);
  } finally {
    state.channelsLoading = false;
  }
}

export async function startWhatsAppLogin(state: ChannelsState, force: boolean) {
  if (!state.client || !state.connected || state.whatsappBusy) return;
  state.whatsappBusy = true;
  try {
    const res = (await state.client.request("web.login.start", {
      force,
      timeoutMs: 30000,
    })) as { message?: string; qrDataUrl?: string };
    state.whatsappLoginMessage = res.message ?? null;
    state.whatsappLoginQrDataUrl = res.qrDataUrl ?? null;
    state.whatsappLoginConnected = null;
  } catch (err) {
    state.whatsappLoginMessage = String(err);
    state.whatsappLoginQrDataUrl = null;
    state.whatsappLoginConnected = null;
  } finally {
    state.whatsappBusy = false;
  }
}

export async function waitWhatsAppLogin(state: ChannelsState) {
  if (!state.client || !state.connected || state.whatsappBusy) return;
  state.whatsappBusy = true;
  try {
    const res = (await state.client.request("web.login.wait", {
      timeoutMs: 120000,
    })) as { connected?: boolean; message?: string };
    state.whatsappLoginMessage = res.message ?? null;
    state.whatsappLoginConnected = res.connected ?? null;
    if (res.connected) state.whatsappLoginQrDataUrl = null;
  } catch (err) {
    state.whatsappLoginMessage = String(err);
    state.whatsappLoginConnected = null;
  } finally {
    state.whatsappBusy = false;
  }
}

export async function logoutWhatsApp(state: ChannelsState) {
  if (!state.client || !state.connected || state.whatsappBusy) return;
  state.whatsappBusy = true;
  try {
    await state.client.request("channels.logout", { channel: "whatsapp" });
    state.whatsappLoginMessage = "Logged out.";
    state.whatsappLoginQrDataUrl = null;
    state.whatsappLoginConnected = null;
  } catch (err) {
    state.whatsappLoginMessage = String(err);
  } finally {
    state.whatsappBusy = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Nostr Profile Management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start editing Nostr profile - loads current profile into form
 */
export function startNostrProfileEdit(state: ChannelsState) {
  // Get current profile from snapshot
  const nostrStatus = state.channelsSnapshot?.channels?.nostr as { profile?: NostrProfile } | undefined;
  const currentProfile = nostrStatus?.profile ?? {};
  
  state.nostrProfileEditing = true;
  state.nostrProfileForm = { ...currentProfile };
  state.nostrProfileError = null;
  state.nostrProfileSuccess = null;
}

/**
 * Cancel profile editing
 */
export function cancelNostrProfileEdit(state: ChannelsState) {
  state.nostrProfileEditing = false;
  state.nostrProfileForm = null;
  state.nostrProfileError = null;
  state.nostrProfileSuccess = null;
}

/**
 * Update a field in the profile form
 */
export function updateNostrProfileField(state: ChannelsState, field: keyof NostrProfile, value: string) {
  if (!state.nostrProfileForm) return;
  state.nostrProfileForm = {
    ...state.nostrProfileForm,
    [field]: value || undefined, // Convert empty string to undefined
  };
}

/**
 * Save and publish the Nostr profile via HTTP API
 */
export async function saveNostrProfile(
  state: ChannelsState,
  accountId: string = "default",
): Promise<boolean> {
  if (!state.client || !state.nostrProfileForm) return false;
  if (state.nostrProfileSaving) return false;

  state.nostrProfileSaving = true;
  state.nostrProfileError = null;
  state.nostrProfileSuccess = null;

  try {
    const baseUrl = getHttpBaseUrl(state.client as { url?: string });
    const url = `${baseUrl}/api/channels/nostr/${accountId}/profile`;
    
    const response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.nostrProfileForm),
    });

    const result = await response.json();

    if (!response.ok) {
      state.nostrProfileError = result.error ?? `HTTP ${response.status}`;
      return false;
    }

    // Success - update state
    state.nostrProfileSuccess = result.published
      ? `Profile published to ${result.relayResults?.filter((r: { ok: boolean }) => r.ok).length ?? 0} relay(s)`
      : "Profile saved locally";
    
    // Close form after short delay to show success message
    setTimeout(() => {
      state.nostrProfileEditing = false;
      state.nostrProfileForm = null;
    }, 1500);

    // Refresh channels to get updated profile
    await loadChannels(state, false);
    return true;
  } catch (err) {
    state.nostrProfileError = err instanceof Error ? err.message : String(err);
    return false;
  } finally {
    state.nostrProfileSaving = false;
  }
}

/**
 * Import profile from Nostr relays
 */
export async function importNostrProfile(
  state: ChannelsState,
  accountId: string = "default",
): Promise<boolean> {
  if (!state.client) return false;
  if (state.nostrProfileImporting) return false;

  state.nostrProfileImporting = true;
  state.nostrProfileError = null;
  state.nostrProfileSuccess = null;

  try {
    const baseUrl = getHttpBaseUrl(state.client as { url?: string });
    const url = `${baseUrl}/api/channels/nostr/${accountId}/profile/import`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const result = await response.json();

    if (!response.ok) {
      state.nostrProfileError = result.error ?? `HTTP ${response.status}`;
      return false;
    }

    if (!result.found) {
      state.nostrProfileError = "No profile found on relays";
      return false;
    }

    // Update form with imported profile
    state.nostrProfileForm = result.profile;
    state.nostrProfileSuccess = `Imported profile from ${result.relaysQueried} relay(s)`;
    return true;
  } catch (err) {
    state.nostrProfileError = err instanceof Error ? err.message : String(err);
    return false;
  } finally {
    state.nostrProfileImporting = false;
  }
}
