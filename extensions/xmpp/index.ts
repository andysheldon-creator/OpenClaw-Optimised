import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { xmppPlugin } from "./src/channel.js";
import { setXmppRuntime } from "./src/runtime.js";

const plugin = {
  id: "xmpp",
  name: "XMPP",
  description: "XMPP channel plugin (stanza.js)",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setXmppRuntime(api.runtime);
    api.registerChannel({ plugin: xmppPlugin });
  },
};

export default plugin;
