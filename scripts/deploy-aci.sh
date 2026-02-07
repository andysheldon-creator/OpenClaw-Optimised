#!/usr/bin/env bash
#
# deploy-aci.sh — Deploy OpenClaw Gateway to Azure Container Instances
#
# Usage:
#   ./scripts/deploy-aci.sh              # Interactive prompts
#   AZURE_LOCATION=westus ./scripts/deploy-aci.sh  # Override defaults via env
#
# Idempotent: safe to re-run for updates (rebuilds image, recreates container).
#
set -euo pipefail

# ─── Defaults (override via environment variables) ────────────────────────────

AZURE_RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-openclaw-rg}"
AZURE_LOCATION="${AZURE_LOCATION:-eastus}"
AZURE_ACR_NAME="${AZURE_ACR_NAME:-openclawacr}"
AZURE_STORAGE_ACCOUNT="${AZURE_STORAGE_ACCOUNT:-openclawstorage}"
AZURE_FILE_SHARE="${AZURE_FILE_SHARE:-openclaw-state}"
AZURE_CONTAINER_NAME="${AZURE_CONTAINER_NAME:-openclaw-gateway}"
AZURE_DNS_LABEL="${AZURE_DNS_LABEL:-openclaw-gateway}"
AZURE_CPU="${AZURE_CPU:-1}"
AZURE_MEMORY="${AZURE_MEMORY:-2}"

# ─── Helpers ──────────────────────────────────────────────────────────────────

info()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn()  { printf '\033[1;33mWARN:\033[0m %s\n' "$*"; }
error() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

prompt_var() {
  local var_name="$1" prompt_text="$2" default_val="$3"
  local current_val="${!var_name:-$default_val}"
  if [[ -t 0 ]]; then
    printf '%s [%s]: ' "$prompt_text" "$current_val"
    read -r input
    if [[ -n "$input" ]]; then
      eval "$var_name=\$input"
    else
      eval "$var_name=\$current_val"
    fi
  else
    eval "$var_name=\$current_val"
  fi
}

prompt_secret() {
  local var_name="$1" prompt_text="$2" required="${3:-false}"
  local current_val="${!var_name:-}"
  if [[ -n "$current_val" ]]; then
    info "$prompt_text: (using value from environment)"
    return
  fi
  if [[ -t 0 ]]; then
    printf '%s: ' "$prompt_text"
    read -rs input
    echo
    eval "$var_name=\$input"
  fi
  if [[ "$required" == "true" && -z "${!var_name:-}" ]]; then
    error "$var_name is required. Set it via environment or enter interactively."
  fi
}

# ─── Preflight ────────────────────────────────────────────────────────────────

if ! command -v az &>/dev/null; then
  error "Azure CLI (az) not found. Install it: https://aka.ms/InstallAzureCLI"
fi

# Ensure logged in
if ! az account show &>/dev/null; then
  info "Not logged in to Azure. Running 'az login'..."
  az login
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ ! -f "$REPO_ROOT/Dockerfile" ]]; then
  error "Cannot find Dockerfile. Run this script from the openclaw repo root."
fi

# ─── Collect configuration ────────────────────────────────────────────────────

info "Configure deployment (press Enter to accept defaults)"
echo

prompt_var AZURE_RESOURCE_GROUP "Resource group"          "$AZURE_RESOURCE_GROUP"
prompt_var AZURE_LOCATION       "Azure region"            "$AZURE_LOCATION"
prompt_var AZURE_ACR_NAME       "Container registry name" "$AZURE_ACR_NAME"
prompt_var AZURE_STORAGE_ACCOUNT "Storage account name"   "$AZURE_STORAGE_ACCOUNT"
prompt_var AZURE_FILE_SHARE     "File share name"         "$AZURE_FILE_SHARE"
prompt_var AZURE_CONTAINER_NAME "Container instance name" "$AZURE_CONTAINER_NAME"
prompt_var AZURE_DNS_LABEL      "DNS label (FQDN prefix)" "$AZURE_DNS_LABEL"
prompt_var AZURE_CPU            "CPU cores"               "$AZURE_CPU"
prompt_var AZURE_MEMORY         "Memory (GB)"             "$AZURE_MEMORY"

echo
prompt_secret OPENCLAW_GATEWAY_TOKEN "Gateway token (leave blank to auto-generate)" false
if [[ -z "${OPENCLAW_GATEWAY_TOKEN:-}" ]]; then
  OPENCLAW_GATEWAY_TOKEN="$(openssl rand -hex 32)"
  info "Generated gateway token: $OPENCLAW_GATEWAY_TOKEN"
  warn "Save this token — you will need it to access the Control UI."
fi

prompt_secret ANTHROPIC_API_KEY   "Anthropic API key (optional)" false
prompt_secret OPENAI_API_KEY      "OpenAI API key (optional)" false

echo
info "Deployment summary:"
echo "  Resource group:   $AZURE_RESOURCE_GROUP"
echo "  Location:         $AZURE_LOCATION"
echo "  Registry:         $AZURE_ACR_NAME"
echo "  Storage account:  $AZURE_STORAGE_ACCOUNT"
echo "  File share:       $AZURE_FILE_SHARE"
echo "  Container:        $AZURE_CONTAINER_NAME"
echo "  DNS label:        $AZURE_DNS_LABEL"
echo "  CPU / Memory:     ${AZURE_CPU} vCPU / ${AZURE_MEMORY} GB"
echo

if [[ -t 0 ]]; then
  printf 'Proceed? [Y/n] '
  read -r confirm
  if [[ "$confirm" =~ ^[Nn] ]]; then
    echo "Aborted."
    exit 0
  fi
fi

# ─── 1. Resource Group ───────────────────────────────────────────────────────

info "Creating resource group '$AZURE_RESOURCE_GROUP' in '$AZURE_LOCATION'..."
az group create \
  --name "$AZURE_RESOURCE_GROUP" \
  --location "$AZURE_LOCATION" \
  --output none

# ─── 2. Container Registry ───────────────────────────────────────────────────

info "Creating container registry '$AZURE_ACR_NAME'..."
az acr create \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$AZURE_ACR_NAME" \
  --sku Basic \
  --admin-enabled true \
  --output none

ACR_LOGIN_SERVER="$(az acr show \
  --name "$AZURE_ACR_NAME" \
  --query loginServer \
  --output tsv)"
info "Registry server: $ACR_LOGIN_SERVER"

# ─── 3. Build & Push Image ───────────────────────────────────────────────────

IMAGE_TAG="${ACR_LOGIN_SERVER}/openclaw:latest"

info "Building image via ACR (this may take a few minutes)..."
az acr build \
  --registry "$AZURE_ACR_NAME" \
  --image "openclaw:latest" \
  --file "$REPO_ROOT/Dockerfile" \
  "$REPO_ROOT"

# ─── 4. Storage Account & File Share ─────────────────────────────────────────

info "Creating storage account '$AZURE_STORAGE_ACCOUNT'..."
az storage account create \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$AZURE_STORAGE_ACCOUNT" \
  --location "$AZURE_LOCATION" \
  --sku Standard_LRS \
  --output none

STORAGE_KEY="$(az storage account keys list \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --account-name "$AZURE_STORAGE_ACCOUNT" \
  --query '[0].value' \
  --output tsv)"

info "Creating file share '$AZURE_FILE_SHARE'..."
az storage share create \
  --account-name "$AZURE_STORAGE_ACCOUNT" \
  --account-key "$STORAGE_KEY" \
  --name "$AZURE_FILE_SHARE" \
  --quota 5 \
  --output none

# ─── 5. ACR Credentials ──────────────────────────────────────────────────────

ACR_USERNAME="$(az acr credential show \
  --name "$AZURE_ACR_NAME" \
  --query username \
  --output tsv)"
ACR_PASSWORD="$(az acr credential show \
  --name "$AZURE_ACR_NAME" \
  --query 'passwords[0].value' \
  --output tsv)"

# ─── 6. Build secure env vars list ───────────────────────────────────────────

SECURE_ENV_ARGS=(
  --secure-environment-variables
  "OPENCLAW_GATEWAY_TOKEN=$OPENCLAW_GATEWAY_TOKEN"
)
if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
  SECURE_ENV_ARGS+=("ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY")
fi
if [[ -n "${OPENAI_API_KEY:-}" ]]; then
  SECURE_ENV_ARGS+=("OPENAI_API_KEY=$OPENAI_API_KEY")
fi

# ─── 7. Delete existing container (if updating) ──────────────────────────────

if az container show \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$AZURE_CONTAINER_NAME" &>/dev/null; then
  info "Deleting existing container '$AZURE_CONTAINER_NAME' for update..."
  az container delete \
    --resource-group "$AZURE_RESOURCE_GROUP" \
    --name "$AZURE_CONTAINER_NAME" \
    --yes \
    --output none
fi

# ─── 8. Create Container Instance ────────────────────────────────────────────

info "Creating container instance '$AZURE_CONTAINER_NAME'..."
az container create \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$AZURE_CONTAINER_NAME" \
  --image "$IMAGE_TAG" \
  --registry-login-server "$ACR_LOGIN_SERVER" \
  --registry-username "$ACR_USERNAME" \
  --registry-password "$ACR_PASSWORD" \
  --cpu "$AZURE_CPU" \
  --memory "$AZURE_MEMORY" \
  --ports 18789 18790 \
  --dns-name-label "$AZURE_DNS_LABEL" \
  --environment-variables \
    "HOME=/home/node" \
    "NODE_ENV=production" \
    "OPENCLAW_PREFER_PNPM=1" \
  "${SECURE_ENV_ARGS[@]}" \
  --azure-file-volume-account-name "$AZURE_STORAGE_ACCOUNT" \
  --azure-file-volume-account-key "$STORAGE_KEY" \
  --azure-file-volume-share-name "$AZURE_FILE_SHARE" \
  --azure-file-volume-mount-path "/home/node/.openclaw" \
  --command-line "node openclaw.mjs gateway --allow-unconfigured --bind lan --port 18789" \
  --restart-policy Always \
  --output none

# ─── 9. Get FQDN ─────────────────────────────────────────────────────────────

FQDN="$(az container show \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$AZURE_CONTAINER_NAME" \
  --query 'ipAddress.fqdn' \
  --output tsv)"

STATE="$(az container show \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --name "$AZURE_CONTAINER_NAME" \
  --query 'instanceView.state' \
  --output tsv)"

# ─── Done ─────────────────────────────────────────────────────────────────────

echo
info "Deployment complete!"
echo
echo "  State:       $STATE"
echo "  FQDN:        $FQDN"
echo "  Control UI:  http://${FQDN}:18789/"
echo "  Bridge:      ws://${FQDN}:18790/"
echo
echo "  Gateway token: $OPENCLAW_GATEWAY_TOKEN"
echo
echo "Verify:"
echo "  az container show -g $AZURE_RESOURCE_GROUP -n $AZURE_CONTAINER_NAME --query instanceView.state"
echo "  az container logs -g $AZURE_RESOURCE_GROUP -n $AZURE_CONTAINER_NAME"
echo
echo "Cleanup (deletes everything):"
echo "  az group delete --name $AZURE_RESOURCE_GROUP --yes --no-wait"
echo
