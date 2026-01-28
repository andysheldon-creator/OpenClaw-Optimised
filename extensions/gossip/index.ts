// IndexedDB polyfill for Node (SDK uses Dexie). Must run before any gossip code.
import "fake-indexeddb/auto";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { gossipPlugin } from "./src/channel.js";
import { setGossipResolvePath, setGossipRuntime } from "./src/runtime.js";

const plugin = {
  id: "gossip",
  name: "Gossip",
  description: "Gossip decentralized messenger channel plugin with post-quantum encryption",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setGossipRuntime(api.runtime);
    setGossipResolvePath(api.resolvePath);
    api.registerChannel({ plugin: gossipPlugin });
  },
};

export default plugin;
