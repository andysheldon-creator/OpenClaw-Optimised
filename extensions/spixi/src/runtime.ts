import { type ExtensionRuntime } from "openclaw/plugin-sdk";
import axios from "axios";

export interface SpixiRuntime extends ExtensionRuntime {
  channel: {
    spixi: {
      sendMessage: (to: string, text: string, opts?: { baseUrl?: string }) => Promise<any>;
      addContact: (address: string, opts?: { baseUrl?: string }) => Promise<any>;
      getFriendList: (opts?: { baseUrl?: string }) => Promise<string[]>;
      acceptContact: (address: string, opts?: { baseUrl?: string }) => Promise<any>;
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
    // Fallback if runtime not yet set (e.g. tests or early init)
    // Create a dummy runtime and attach spixi methods
    runtime = {} as any;
  }

  // Ensure channel.spixi exists on the runtime
  if (!runtime.channel) {
    (runtime as any).channel = {};
  }

  if (!(runtime.channel as any).spixi) {
    const spixiMethods = {
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
          // QuIXI uses GET: /contacts
          const url = new URL("/contacts", baseUrl);
          const res = await axios.get(url.toString());
          // Response is array of contact objects with address field
          const contacts = res.data || [];
          return Array.isArray(contacts)
            ? contacts.map((c: any) => c.address || c).filter(Boolean)
            : [];
        } catch (e: any) {
          throw new Error(`Spixi getFriendList failed: ${e.message}`);
        }
      },
      acceptContact: async (address: string, opts?: { baseUrl?: string }) => {
        const baseUrl = opts?.baseUrl || defaultBaseUrl;
        try {
          // QuIXI uses GET: /acceptContact?address=
          const url = new URL("/acceptContact", baseUrl);
          url.searchParams.set("address", address);

          const res = await axios.get(url.toString());
          return {
            success: true,
            address,
            ...res.data
          };
        } catch (e: any) {
          throw new Error(`Spixi acceptContact failed: ${e.message}`);
        }
      }
    };

    (runtime.channel as any).spixi = spixiMethods;
  }

  return runtime;
};

export const setSpixiRuntime = (r: SpixiRuntime) => {
  runtime = r;
};

