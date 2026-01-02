#!/bin/bash
# ============================================================
# Deploy Nocturne Vue to Car Thing Device
# ============================================================
# Usage:
#   ./sync-to-device.sh           # Build and deploy
#   ./sync-to-device.sh --skip-build  # Deploy only (use existing dist/)
# ============================================================

set -e

DEVICE_IP="172.16.42.2"
DEVICE_USER="root"
REMOTE_PATH="/etc/nocturne/ui"
SKIP_BUILD=false

# Parse args
for arg in "$@"; do
  case $arg in
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
  esac
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Nocturne Vue Deployment${NC}"
echo -e "${GREEN}========================================${NC}"

# Change to script directory (nocturne-vue/)
cd "$(dirname "$0")"

# Step 1: Build (unless skipped)
if [ "$SKIP_BUILD" = false ]; then
  echo -e "\n${YELLOW}[1/4] Building...${NC}"
  npm run build
else
  echo -e "\n${YELLOW}[1/4] Skipping build (--skip-build)${NC}"
fi

# Verify dist exists
if [ ! -d "dist" ]; then
  echo -e "${RED}Error: dist/ directory not found. Run without --skip-build${NC}"
  exit 1
fi

# Step 2: Check device connectivity
echo -e "\n${YELLOW}[2/4] Checking device connectivity...${NC}"
# Cross-platform ping: try Linux syntax first, then Windows
if ping -c 1 -W 2 $DEVICE_IP > /dev/null 2>&1 || ping -n 1 -w 2000 $DEVICE_IP > /dev/null 2>&1; then
  echo -e "${GREEN}Device reachable${NC}"
else
  echo -e "${RED}Error: Cannot reach device at $DEVICE_IP${NC}"
  echo "Make sure the Car Thing is connected via USB"
  exit 1
fi

# Step 3: Clear browser cache (preserve Local Storage for auth tokens)
echo -e "\n${YELLOW}[3/4] Clearing browser cache (preserving auth tokens)...${NC}"
ssh ${DEVICE_USER}@${DEVICE_IP} "rm -rf /var/cache/chrome_storage/Default/Cache/* 2>/dev/null || true"
ssh ${DEVICE_USER}@${DEVICE_IP} "rm -rf /var/cache/chrome_storage/Default/Code\ Cache/* 2>/dev/null || true"
ssh ${DEVICE_USER}@${DEVICE_IP} "rm -rf /var/cache/chrome_storage/Default/GPUCache/* 2>/dev/null || true"
echo -e "${GREEN}Cache cleared${NC}"

# Step 4: Deploy files
echo -e "\n${YELLOW}[4/4] Deploying to device...${NC}"
ssh ${DEVICE_USER}@${DEVICE_IP} "mount -o remount,rw /"
ssh ${DEVICE_USER}@${DEVICE_IP} "rm -rf ${REMOTE_PATH}/assets/*"
scp -r dist/* ${DEVICE_USER}@${DEVICE_IP}:${REMOTE_PATH}/
ssh ${DEVICE_USER}@${DEVICE_IP} "mount -o remount,ro /"
echo -e "${GREEN}Files deployed${NC}"

# Step 5: Reload browser
echo -e "\n${YELLOW}Reloading browser...${NC}"
ssh ${DEVICE_USER}@${DEVICE_IP} "sv restart chromium"
echo -e "${GREEN}Browser restarted${NC}"

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  Deployment complete!${NC}"
echo -e "${GREEN}========================================${NC}"
