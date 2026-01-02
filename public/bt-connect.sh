#!/bin/sh
# Bluetooth connect - connects then deletes NAP profile to prevent iPhone disconnect
# Usage: bt-connect.sh <bluetooth-address>

ADDRESS="$1"
if [ -z "$ADDRESS" ]; then
    echo "Usage: bt-connect.sh <bluetooth-address>"
    exit 1
fi

mount -o remount,rw /

# Connect first (NM will create a connection profile)
nmcli device connect "$ADDRESS" 2>&1

# Give it a moment to connect
sleep 1

# Check if connected
CONNECTED=$(bluetoothctl info "$ADDRESS" 2>/dev/null | grep "Connected: yes")
if [ -n "$CONNECTED" ]; then
    # Delete the NAP profile NM created (prevents iPhone from disconnecting later)
    DEVICE_NAME=$(bluetoothctl info "$ADDRESS" 2>/dev/null | grep "Name:" | cut -d: -f2- | xargs)
    nmcli connection delete "${DEVICE_NAME} Network" 2>/dev/null
    nmcli connection delete "${ADDRESS}" 2>/dev/null
    sync
    echo "connected"
    mount -o remount,ro /
    exit 0
else
    mount -o remount,ro /
    exit 1
fi
