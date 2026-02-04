import { type ExtensionRuntime } from "openclaw/plugin-sdk";
import axios from "axios";

export interface SpixiRuntime extends ExtensionRuntime {
  channel: {
    spixi: {
      sendMessage: (to: string, text: string, opts?: { baseUrl?: string }) => Promise<any>;
      addContact: (address: string, opts?: { baseUrl?: string }) => Promise<any>;
      getFriendList: (opts?: { baseUrl?: string }) => Promise<string[]>;
    };
  };
}

let runtime: SpixiRuntime;

// Default QuIXI API URL - can be overridden via config
let defaultBaseUrl = "http://localhost:8001";

export function setSpixiBaseUrl(url: string) {
  defaultBaseUrl = url;
}

export const getSpixiRuntime = () => {
  if (!runtime) {
    // QuIXI API implementation per docs: https://github.com/ixian-platform/QuIXI
    // All APIs are GET endpoints with query parameters
    return {
      channel: {
        spixi: {
          sendMessage: async (to: string, text: string, opts?: { baseUrl?: string }) => {
            const baseUrl = opts?.baseUrl || defaultBaseUrl;
            try {
              // QuIXI uses GET: /sendChatMessage?address=&message=&channel=
              const url = new URL("/sendChatMessage", baseUrl);
              url.searchParams.set("address", to);
              url.searchParams.set("message", text);
              url.searchParams.set("channel", "0");

              const res = await axios.get(url.toString());
              return {
                messageId: `spixi-${Date.now()}`,
                ...res.data
              };
            } catch (e: any) {
              throw new Error(`Spixi send failed: ${e.message}`);
            }
          },
          addContact: async (address: string, opts?: { baseUrl?: string }) => {
            const baseUrl = opts?.baseUrl || defaultBaseUrl;
            try {
              // QuIXI uses GET: /addContact?address=
              const url = new URL("/addContact", baseUrl);
              url.searchParams.set("address", address);

              const res = await axios.get(url.toString());
              return {
                success: true,
                address,
                ...res.data
              };
            } catch (e: any) {
              throw new Error(`Spixi addContact failed: ${e.message}`);
            }
          },
          getFriendList: async (opts?: { baseUrl?: string }) => {
            const baseUrl = opts?.baseUrl || defaultBaseUrl;
            try {
              // QuIXI uses GET: /getContactList
              const url = new URL("/getContactList", baseUrl);
              const res = await axios.get(url.toString());
              // Response is array of contact objects with address field
              const contacts = res.data || [];
              return Array.isArray(contacts)
                ? contacts.map((c: any) => c.address || c).filter(Boolean)
                : [];
            } catch (e: any) {
              throw new Error(`Spixi getFriendList failed: ${e.message}`);
            }
          }
        }
      }
    } as any;
  }
  return runtime;
};

export const setSpixiRuntime = (r: SpixiRuntime) => {
  runtime = r;
};

