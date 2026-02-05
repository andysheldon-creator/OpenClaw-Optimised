feat: Spixi Channel Integration (Post-Quantum Secure Messaging)

### 🚀 Feature: Spixi Channel Support

This PR integrates **Spixi**, a decentralized, privacy-first, post-quantum secure messaging channel (via the Ixian Platform), into OpenClaw. It enables AI agents to communicate securely over the Mixin Network with full session persistence and bi-directional messaging capabilities.

### Key Capabilities
- **Secure Messaging**: Full inbound/outbound support via local MQTT bridge (default port `1883`).
- **Friend Management**:
    - **Auto-Accept**: Whitelist-based auto-acceptance of friend requests (`allowFrom` config).
    - **Manual Tools**: Agent tools (`spixi_accept_contact`) for programmatic contact management.
    - **Sync**: Automatic contact list synchronization on startup.
- **Session Persistence**: Robust session tracking ensuring conversation history and context are preserved across restarts.
- **Echo Loop Prevention**: Logic to filter self-sent messages via `myWalletAddress` configuration.

### Core Fixes & Enhancements
- **Message Injection**: Fixed `server-channels.ts` to correctly pass `onMessage` callbacks to all channel plugins (resolving a gateway-wide issue).
- **Lifecycle Management**: Refactored `startAccount` to use blocking Promises, ensuring proper MQTT client cleanup on reload and preventing zombie connections.
- **Reply Dispatch**: Implemented robust `onReply` routing in `server-chat.ts` to ensure agent responses are delivered back to the Spixi channel.
- **Policy**: Enforced `sendPolicy="allow"` defaults for new channel sessions to prevent silent failures.

### How to Test
1.  Configure `spixi` in `openclaw.yaml`:
    ```yaml
    channels:
      spixi:
        accounts:
          main:
            mqttHost: "127.0.0.1"
            mqttPort: 1883
            myWalletAddress: "YOUR_WALLET_ADDRESS"
            allowFrom: ["*"]
    ```
2.  Start the gateway: `pnpm start`
3.  Send a message from Spixi Client to the bot.
4.  Verify the agent replies and the conversation is persisted.

---

### AI/Vibe-Coded PR 🤖

**Degree of Testing**:
- [x] **Fully Tested**: Verified end-to-end messaging, friend requests, and session persistence. Confirmed fix for 4x message duplication.

**Context**:
- [x] I understand what this code does
- [x] Generated with Google Antigravity
