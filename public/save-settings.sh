#!/bin/sh
# Save settings.json - called from browser via nocturned /device/exec
# Usage: save-settings.sh <base64-encoded-json>
SETTINGS_PATH="/etc/nocturne/ui/settings.json"
mount -o remount,rw /
echo "$1" | base64 -d > "$SETTINGS_PATH"
mount -o remount,ro /
cat "$SETTINGS_PATH"
