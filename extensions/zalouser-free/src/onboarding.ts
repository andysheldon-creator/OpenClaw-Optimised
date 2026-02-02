/**
 * Onboarding Adapter for zalouser-free
 */

import type { ZaloUserFreeAccountConfig } from "./types.js";
import { DEFAULT_ACCOUNT_ID } from "./accounts.js";
import { ZaloSessionManager } from "./session-manager.js";

export interface OnboardingStatus {
    ready: boolean;
    authenticated: boolean;
    warnings: string[];
    errors: string[];
}

export interface OnboardingAdapter {
    id: string;
    displayName: string;
    getStatus: (cfg: unknown, accountId?: string) => Promise<OnboardingStatus>;
    getPrompts: () => Array<{
        key: string;
        label: string;
        type: "text" | "select" | "boolean";
        options?: string[];
        required?: boolean;
    }>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    applyConfig: (cfg: unknown, accountId: string, input: Record<string, any>) => any;
}

export const zalouserFreeOnboardingAdapter: OnboardingAdapter = {
    id: "zalouser-free",
    displayName: "Zalo (Free, Zalo Personal, zca-js)",

    getStatus: async (cfg: unknown, accountId?: string): Promise<OnboardingStatus> => {
        const id = accountId ?? DEFAULT_ACCOUNT_ID;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const channelConfig = (cfg as any)?.channels?.["zalouser-free"];
        const accountConfig = channelConfig?.accounts?.[id];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pluginConfig = (cfg as any)?.plugins?.entries?.["zalouser-free"]?.config;

        // Check for actual saved credentials
        const sessionPath = pluginConfig?.sessionPath;
        // We can instantiate the manager here just to check credentials
        // Note: This relies on the session file existing on disk
        const manager = new ZaloSessionManager(sessionPath);
        const hasCredentials = manager.hasSavedCredentials(id);

        // Status is authenticated if we have credentials
        const authenticated = hasCredentials;
        // Ready if authenticated and enabled
        const enabled = Boolean(accountConfig?.enabled);
        const ready = authenticated && enabled;

        return {
            ready,
            authenticated,
            warnings: !authenticated ? ["Not logged in. Run: openclaw zalouser-free login"] : (!enabled ? ["Account is disabled (but authenticated)."] : []),
            errors: [],
        };
    },

    getPrompts: () => [
        {
            key: "dmAccess",
            label: "DM Access Policy",
            type: "select" as const,
            options: ["whitelist", "open"],
            required: false,
        },
        {
            key: "groupAccess",
            label: "Group Access Policy",
            type: "select" as const,
            options: ["mention", "whitelist", "open"],
            required: false,
        },
    ],

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    applyConfig: (cfg: unknown, accountId: string, input: Record<string, any>) => {
        const id = accountId ?? DEFAULT_ACCOUNT_ID;

        const accountConfig: Partial<ZaloUserFreeAccountConfig> = {
            enabled: true,
            dmAccess: input.dmAccess || "whitelist",
            groupAccess: input.groupAccess || "mention",
            allowedUsers: input.allowedUsers || [],
            allowedGroups: input.allowedGroups || [],
        };

        return {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...(cfg as any),
            channels: {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ...(cfg as any).channels,
                "zalouser-free": {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ...(cfg as any).channels?.["zalouser-free"],
                    enabled: true,
                    accounts: {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        ...(cfg as any).channels?.["zalouser-free"]?.accounts,
                        [id]: {
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            ...(cfg as any).channels?.["zalouser-free"]?.accounts?.[id],
                            ...accountConfig,
                        },
                    },
                },
            },
        };
    },
};
