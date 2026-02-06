#!/usr/bin/env bash
# deploy-prod.sh — Deploy OpenClaw to production
#
# Builds in the Development repo and rsyncs runtime artifacts to the
# Deployments folder. Does NOT touch launchd plists or restart the gateway.
#
# Usage:
#   ./scripts/deploy-prod.sh              # Build + deploy
#   ./scripts/deploy-prod.sh --skip-build # Deploy existing dist (no rebuild)
#   ./scripts/deploy-prod.sh --backup     # Backup previous deployment first
#   ./scripts/deploy-prod.sh --dry-run    # Show what would be synced
#
# After deploying, restart the gateway manually:
#   launchctl kickstart -k gui/$(id -u)/ai.openclaw.gateway

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────
SOURCE_DIR="${OPENCLAW_SOURCE:-$HOME/Development/openclaw}"
DEPLOY_DIR="${OPENCLAW_DEPLOY:-$HOME/Deployments/openclaw-prod}"

# Runtime artifacts the gateway needs (and nothing else)
# If upstream adds new runtime requirements, update this list.
# See: scratch/runtime-requirements.md for the investigation.
RUNTIME_DIRS=(
  dist/
  node_modules/
  skills/
  assets/
)
RUNTIME_FILES=(
  package.json
)

# ── Flags ─────────────────────────────────────────────────────────────
SKIP_BUILD=false
BACKUP=false
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
    --backup)     BACKUP=true ;;
    --dry-run)    DRY_RUN=true ;;
    --help|-h)
      head -14 "$0" | tail -12
      exit 0
      ;;
    *)
      echo "Unknown flag: $arg (try --help)"
      exit 1
      ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────
info()  { echo "  → $*"; }
warn()  { echo "  ⚠ $*" >&2; }
die()   { echo "  ✖ $*" >&2; exit 1; }

# ── Pre-flight checks ────────────────────────────────────────────────
echo "╔══════════════════════════════════════╗"
echo "║   OpenClaw Production Deploy         ║"
echo "╚══════════════════════════════════════╝"
echo ""

[ -d "$SOURCE_DIR" ]          || die "Source dir not found: $SOURCE_DIR"
[ -f "$SOURCE_DIR/package.json" ] || die "Not an OpenClaw repo: $SOURCE_DIR"

# Capture git info for version tracking
cd "$SOURCE_DIR"
GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
GIT_DIRTY=""
if ! git diff --quiet 2>/dev/null; then
  GIT_DIRTY="-dirty"
fi

info "Source:  $SOURCE_DIR ($GIT_BRANCH @ $GIT_HASH$GIT_DIRTY)"
info "Target:  $DEPLOY_DIR"
echo ""

# ── Build ─────────────────────────────────────────────────────────────
if [ "$SKIP_BUILD" = true ]; then
  info "Skipping build (--skip-build)"
  [ -d "$SOURCE_DIR/dist" ] || die "No dist/ found — can't skip build without existing dist"
else
  info "Building..."
  cd "$SOURCE_DIR"
  pnpm build --quiet 2>&1 | tail -3
  info "Build complete"
fi
echo ""

# Verify dist exists and looks sane
[ -f "$SOURCE_DIR/dist/index.js" ] || die "dist/index.js not found after build"

# ── Backup previous deployment ────────────────────────────────────────
if [ "$BACKUP" = true ] && [ -d "$DEPLOY_DIR/dist" ]; then
  BACKUP_NAME="$DEPLOY_DIR.backup-$(date +%Y%m%d-%H%M%S)"
  info "Backing up previous deployment → $BACKUP_NAME"
  if [ "$DRY_RUN" = false ]; then
    cp -a "$DEPLOY_DIR" "$BACKUP_NAME"
  fi
fi

# ── Deploy ────────────────────────────────────────────────────────────
mkdir -p "$DEPLOY_DIR"

RSYNC_FLAGS=(-a --delete)
if [ "$DRY_RUN" = true ]; then
  RSYNC_FLAGS+=(--dry-run)
  info "DRY RUN — showing what would be synced:"
fi

# Sync directories
for dir in "${RUNTIME_DIRS[@]}"; do
  if [ -d "$SOURCE_DIR/$dir" ]; then
    info "Syncing $dir"
    rsync "${RSYNC_FLAGS[@]}" "$SOURCE_DIR/$dir" "$DEPLOY_DIR/$dir"
  else
    warn "Directory not found, skipping: $dir"
  fi
done

# Copy individual files
for file in "${RUNTIME_FILES[@]}"; do
  if [ -f "$SOURCE_DIR/$file" ]; then
    info "Copying $file"
    if [ "$DRY_RUN" = false ]; then
      cp "$SOURCE_DIR/$file" "$DEPLOY_DIR/$file"
    fi
  else
    warn "File not found, skipping: $file"
  fi
done

# Write version stamp
if [ "$DRY_RUN" = false ]; then
  cat > "$DEPLOY_DIR/VERSION" <<EOF
branch: $GIT_BRANCH
commit: $GIT_HASH$GIT_DIRTY
deployed: $(date -u +%Y-%m-%dT%H:%M:%SZ)
deployed_by: $(whoami)
source: $SOURCE_DIR
EOF
  info "Version stamp written"
fi

echo ""

# ── Post-deploy verification ─────────────────────────────────────────
if [ "$DRY_RUN" = false ]; then
  [ -f "$DEPLOY_DIR/dist/index.js" ] || die "VERIFICATION FAILED: dist/index.js missing from deployment!"
  [ -d "$DEPLOY_DIR/node_modules" ] || die "VERIFICATION FAILED: node_modules/ missing from deployment!"
  [ -f "$DEPLOY_DIR/package.json" ] || die "VERIFICATION FAILED: package.json missing from deployment!"

  DEPLOY_SIZE=$(du -sh "$DEPLOY_DIR" 2>/dev/null | cut -f1)
  info "Deployment verified ✓ ($DEPLOY_SIZE)"
fi

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   Deploy complete                    ║"
echo "║                                      ║"
echo "║   To activate, restart the gateway:  ║"
echo "║   launchctl kickstart -k \\           ║"
echo "║     gui/\$(id -u)/ai.openclaw.gateway ║"
echo "╚══════════════════════════════════════╝"
