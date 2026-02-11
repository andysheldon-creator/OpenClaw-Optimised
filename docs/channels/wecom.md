# WeCom (Enterprise WeChat)

WeCom is an enterprise-level communication and collaboration platform launched by Tencent. It supports various communication methods such as text, voice, images, and files, and provides enterprise-level capabilities like organizational structure management and application integration. It is widely used for internal communication and business collaboration within enterprises.

This plugin connects OpenClaw with WeCom, supporting parallel access via dual modes: **Bot (Intelligent Agent)** and **Agent (Self-built Application)**. Bot mode provides a real-time streaming conversation experience, while Agent mode offers enterprise-level capabilities such as file sending, proactive pushing, and scheduled broadcasts. The two modes intelligently complement each other, automatically switching to the Agent channel as a fallback when Bot capabilities are limited, enabling stable and secure message exchange and automation capability integration.

# Step 1: Install the WeCom Plugin

Install via the OpenClaw plugins command:

```
openclaw plugins install @yanhaidao/wecom@latest
```

Install from source code:

```
git clone https://github.com/yanhaidao/wecom.git && cd wecom
openclaw plugins install .
```

# Step 2: Create a WeCom Application

## Mode Selection

This plugin supports two modes. You can choose one or enable both according to your needs:

| Mode | Applicable Scenarios | Core Capabilities |
| :--- | :--- | :--- |
| **Bot (Intelligent Agent)** | Real-time Conversation | Streaming Response (Typewriter Effect), Group Chat @ Reply |
| **Agent (Self-built Application)** | Enterprise-level Push | File Sending, Proactive Push, Cronjob Scheduled Broadcasts, Image/Voice/Video Reception |

It is recommended to enable both modes for the best experience.

## Bot Mode Configuration (Intelligent Agent, Optional)

### 1. Log in to the WeCom Admin Console

Go to the [WeCom Admin Console](https://work.weixin.qq.com/wework_admin/frame) and log in.

![register account](../images/wecom-register.png)

### 2. Create an Intelligent Robot

Navigate to "Security & Management" → "Management Tools" → "Intelligent Robot", create a robot, and select the **API Mode**.

![create bot](../images/wecom-step2-bot-create.png)
![select api model](../images/wecom-step2-bot-model.png)

### 3. Configure the Callback URL

Fill in the callback URL: `https://your-domain.com/wecom/bot`

Record the **Token** and **EncodingAESKey** generated on the page, which will be needed later in "Step 3: Configure OpenClaw".

Note: Please securely store the Token and EncodingAESKey and do not disclose them.

![bot callback config](../images/wecom-step2-bot-config.png)

## Agent Mode Configuration (Self-built Application, Optional)

### 1. Create a Self-built Application

In the WeCom Admin Console, go to "Application Management" → "Self-built" → Create Application.

![create agent app](../images/wecom-step2-agent-create.png)

### 2. Obtain Application Credentials

On the application details page, obtain the following information, copy it, and store it securely:

- **CorpId** (Corporate ID, viewable on the "My Company" page)
- **AgentId** (Application ID)
- **Secret** (Application Secret)

Note: For security reasons, the Secret cannot be stored in plaintext. If viewed for the first time or forgotten, it must be regenerated.

![corpid](../images/wecom-step3-corpid.png)
![agentid and secret](../images/wecom-step3-agentid-secret.png)

### 3. Configure API Reception

In the application details, set up "Receive Messages - Configure API Reception":

- Fill in the callback URL: `https://your-domain.com/wecom/agent`
- Record the callback **Token** and **EncodingAESKey**

![agent api receive config](../images/wecom-step2-agent-config-api.png)

### 4. Configure Trusted Company IP

Go to Application Details → "Trusted Company IP" → "Configure" → Add your server's public IP address.

If you are using intranet penetration or have a dynamic IP, it is recommended to configure `channels.wecom.network.egressProxyUrl` in step 3 to use a fixed egress proxy. Otherwise, you may encounter the `60020 not allow to access from your ip` error.
![trusted ip config](../images/wecom-step2-agent-config-ip.png)

# Step 3: Configure OpenClaw

## Method 1: Configure via Command Line (Recommended)

### Bot Mode

```
openclaw channels add --channel wecom
openclaw config set channels.wecom.enabled true
openclaw config set channels.wecom.bot.token "YOUR_BOT_TOKEN"
openclaw config set channels.wecom.bot.encodingAESKey "YOUR_BOT_AES_KEY"
```

### Agent Mode (Optional)

```
openclaw config set channels.wecom.agent.corpId "YOUR_CORP_ID"
openclaw config set channels.wecom.agent.corpSecret "YOUR_CORP_SECRET"
openclaw config set channels.wecom.agent.agentId 1000001
openclaw config set channels.wecom.agent.token "YOUR_CALLBACK_TOKEN"
openclaw config set channels.wecom.agent.encodingAESKey "YOUR_CALLBACK_AES_KEY"
```

### Network Proxy (Optional, for Dynamic IP Scenarios)

```
openclaw config set channels.wecom.network.egressProxyUrl "http://proxy.company.local:3128"
```

## Method 2: Configure via Configuration File

Edit `~/.openclaw/openclaw.json`:

```json
{
  "channels": {
    "wecom": {
      "enabled": true,
      "bot": {
        "token": "YOUR_BOT_TOKEN",
        "encodingAESKey": "YOUR_BOT_AES_KEY"
      },
      "agent": {
        "corpId": "YOUR_CORP_ID",
        "corpSecret": "YOUR_CORP_SECRET",
        "agentId": 1000001,
        "token": "YOUR_CALLBACK_TOKEN",
        "encodingAESKey": "YOUR_CALLBACK_AES_KEY"
      }
    }
  }
}
```

# Step 4: Start and Test

## 1. Start Gateway

```
openclaw gateway
```

## 2. Verify Connection Status

```
openclaw channels status
```

## 3. Bot Mode Test

Return to the WeCom admin console, go to "Security & Management" → "Management Tools" → "Smart Bots", find the OpenClaw Bot, and click "Details"
![bot detail](../images/wecom-step4-bot-detail.png)

After entering the smart bot details interface, select "Get Bot QR Code", scan it, and test in the WeCom client.
![bot test](../images/wecom-step4-bot-test.png)
![bot talk](../images/wecom-step4-bot-talk.png)

## 4. Agent Mode Test

Enter the WeCom client, select "Workbench", find the OpenClaw Agent application, and conduct a conversation test.
![agent test](../images/wecom-step4-agent-test.png)
![agent talk](../images/wecom-step4-agent-talk.png)

## 5. Dual Mode Test

After enabling both Bot and Agent modes simultaneously, the plugin adopts a "Bot Priority + Agent Fallback" strategy, automatically selecting the optimal channel.

Add the Bot to the group chat, then mention @Bot in the group to experience all dual-mode capabilities (streaming replies + file sending + timeout relay).

![dual mode launch](../images/wecom-step4-dual-mode-launch.png)
![dual mode test](../images/wecom-step4-dual-model-test.png)