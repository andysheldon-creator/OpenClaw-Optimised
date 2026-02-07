---
summary: "Deploy OpenClaw Gateway to Azure Container Instances (ACI) with persistent storage"
read_when:
  - You want OpenClaw running 24/7 on Azure
  - You want a serverless container deployment without managing VMs
  - You want to deploy to Azure Container Instances
title: "Azure ACI"
---

# Azure Container Instances

**Goal:** OpenClaw Gateway running on [Azure Container Instances](https://learn.microsoft.com/en-us/azure/container-instances/) with persistent state via Azure File Share.

## What you need

- Azure account with an active subscription
- [Azure CLI](https://aka.ms/InstallAzureCLI) (`az`) installed
- OpenClaw repo cloned locally
- Model auth: Anthropic API key (or other provider keys)

## Architecture

```
[Source Code] --> az acr build --> [Azure Container Registry]
                                         |
                                         v
                                  [Azure Container Instance]
                                         |
                                   [Azure File Share]
                                   /home/node/.openclaw
```

- **Ports**: 18789 (gateway + Control UI), 18790 (bridge)
- **Persistent volume**: Azure File Share mounted at `/home/node/.openclaw`
- **Secrets**: Passed as secure environment variables (encrypted at rest)

## Quick start

The deployment script handles everything: resource group, registry, storage, and container creation.

```bash
git clone https://github.com/openclaw/openclaw.git
cd openclaw
./scripts/deploy-aci.sh
```

The script prompts for configuration interactively. Press Enter to accept defaults.

### Non-interactive deployment

Pre-set environment variables to skip prompts:

```bash
export AZURE_LOCATION=westus
export AZURE_RESOURCE_GROUP=my-openclaw-rg
export AZURE_ACR_NAME=myopenclawacr
export AZURE_STORAGE_ACCOUNT=myopenclawstore
export AZURE_DNS_LABEL=my-openclaw
export OPENCLAW_GATEWAY_TOKEN=$(openssl rand -hex 32)
export ANTHROPIC_API_KEY=sk-ant-...

./scripts/deploy-aci.sh
```

## What the script does

1. Creates a resource group
2. Creates an Azure Container Registry (Basic SKU, admin enabled)
3. Builds the Docker image in the cloud via `az acr build` (no Docker Desktop needed)
4. Creates a storage account and 5 GB file share
5. Creates a container instance with the image, mounted storage, and secure env vars
6. Prints the FQDN and Control UI URL

## Access the Control UI

After deployment, open the URL printed by the script:

```
http://<your-dns-label>.<region>.azurecontainer.io:18789/
```

Paste your gateway token to authenticate.

## Verify deployment

```bash
# Check container state
az container show -g openclaw-rg -n openclaw-gateway --query instanceView.state

# View logs
az container logs -g openclaw-rg -n openclaw-gateway

# Follow logs
az container logs -g openclaw-rg -n openclaw-gateway --follow
```

## Updating

To deploy a new version, re-run the script. It rebuilds the image and recreates the container. Your state persists on the file share.

```bash
git pull
./scripts/deploy-aci.sh
```

## Configuration

### Resource defaults

| Resource           | Default            | Env var                      |
| ------------------ | ------------------ | ---------------------------- |
| Resource group     | `openclaw-rg`      | `AZURE_RESOURCE_GROUP`       |
| Location           | `eastus`           | `AZURE_LOCATION`             |
| Container registry | `openclawacr`      | `AZURE_ACR_NAME`             |
| Storage account    | `openclawstorage`  | `AZURE_STORAGE_ACCOUNT`      |
| File share         | `openclaw-state`   | `AZURE_FILE_SHARE`           |
| Container name     | `openclaw-gateway` | `AZURE_CONTAINER_NAME`       |
| DNS label          | `openclaw-gateway` | `AZURE_DNS_LABEL`            |
| CPU / Memory       | 1 vCPU / 2 GB      | `AZURE_CPU` / `AZURE_MEMORY` |

### API keys

Pass provider keys as environment variables before running the script:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
./scripts/deploy-aci.sh
```

These are stored as secure environment variables in ACI (encrypted, not visible in the Azure portal).

## Cost estimate

| Resource                  | Monthly cost |
| ------------------------- | ------------ |
| ACI (1 vCPU, 2 GB, 24/7)  | ~$35-50      |
| ACR Basic                 | ~$5          |
| Storage (5 GB file share) | ~$0.09       |
| **Total**                 | **~$40-55**  |

See [Azure pricing calculator](https://azure.microsoft.com/en-us/pricing/calculator/) for exact estimates.

## Cleanup

Delete everything in one command:

```bash
az group delete --name openclaw-rg --yes --no-wait
```

This removes the resource group and all resources inside it (container, registry, storage).

## Security notes

- ACI exposes ports over HTTP by default. For HTTPS, place an [Azure Application Gateway](https://learn.microsoft.com/en-us/azure/application-gateway/) or [Cloudflare tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/) in front.
- For private networking, deploy into an [Azure Virtual Network](https://learn.microsoft.com/en-us/azure/container-instances/container-instances-vnet).
- The gateway token is required for all non-loopback connections. Treat it like a password.
- Secrets passed via `--secure-environment-variables` are encrypted at rest and not shown in `az container show`.

## Troubleshooting

### Container stuck in "Waiting" or "Creating"

Check events for errors:

```bash
az container show -g openclaw-rg -n openclaw-gateway --query instanceView.events
```

Common causes: ACR credentials expired, image not found, or resource quota limits.

### "Port already allocated" or DNS conflict

The DNS label must be unique per Azure region. Change `AZURE_DNS_LABEL` to something unique:

```bash
AZURE_DNS_LABEL=my-unique-openclaw ./scripts/deploy-aci.sh
```

### OOM / container restarting

Increase memory:

```bash
AZURE_MEMORY=4 ./scripts/deploy-aci.sh
```

### ACR name already taken

ACR names must be globally unique. Pick a different name:

```bash
AZURE_ACR_NAME=myuniqueacrname ./scripts/deploy-aci.sh
```

### Storage account name already taken

Storage account names must be globally unique (3-24 lowercase alphanumeric characters):

```bash
AZURE_STORAGE_ACCOUNT=myuniquestorage ./scripts/deploy-aci.sh
```
