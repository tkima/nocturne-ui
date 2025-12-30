# Nocturne UI (Vue Edition)

**A modern Vue 3 rewrite of the Nocturne Spotify player for Spotify Car Thing devices.**

> Full-featured Spotify controller for jailbroken Car Thing devices with a beautiful, responsive UI.

[![Vue 3](https://img.shields.io/badge/Vue-3.x-4FC08D?logo=vue.js)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.x-06B6D4?logo=tailwindcss)](https://tailwindcss.com/)

## Prerequisites

Before using this UI, you need a **Spotify Car Thing** with the Nocturne firmware installed. No permanent jailbreak required - it just works in USB boot mode.

### Step 1: Flash Your Car Thing

1. Download [nocturne_image_v3.0.0.zip](https://github.com/usenocturne/nocturne/releases/download/v3.0.0/nocturne_image_v3.0.0.zip) (or check [Releases](https://github.com/usenocturne/nocturne/releases) for newer versions)
2. Plug in your Car Thing via USB while holding buttons **1+4** (top buttons)
3. Follow the instructions on [Terbium](https://terbium.app) to flash using the downloaded zip

Flashing takes about 10 minutes. If it's not working, try different USB ports (rear IO, USB 2.0, or BIOS flash port on AMD).

This will install:
- Custom Linux image for Car Thing
- The `nocturned` daemon for hardware control (buttons, brightness, Bluetooth)
- Network connectivity via Raspberry Pi or iPhone Bluetooth tethering
- The original React-based UI

### Step 2: Install Vue Edition (Optional)

This Vue edition is a **drop-in replacement** for the React UI. After flashing, you can replace it:

```bash
# Clone this repo
git clone https://github.com/tkima/nocturne-ui.git
cd nocturne-ui

# Install dependencies and build
npm install
npm run build

# Deploy to device (Car Thing must be connected via USB)
./sync-to-device.sh
```

The deploy script replaces the UI at `/etc/nocturne/ui/` while preserving your auth tokens and settings.

**Note:** No configuration needed! The app uses Spotify's Device Authorization flow by default - just scan the QR code to log in. See [Spotify Auth Relay](#spotify-auth-relay-optional) if you want to use your own Client ID.

## What is this?

This is a complete rewrite of the original React-based Nocturne UI in **Vue 3** with:
- **Vue 3** with Composition API (`<script setup>`)
- **TypeScript** for type safety
- **Pinia** for state management
- **Vue Router** for navigation
- **Tailwind CSS** (exact same CSS as React version)

## Features

- 🎵 **Full Spotify Control** - Play/pause, skip, shuffle, repeat, seek
- 📻 **Browse Library** - Recently played, playlists, artists, podcasts
- 🎛️ **Preset Buttons** - Map albums/playlists to physical buttons (1-4)
- 📱 **WiFi & Bluetooth** - Connect via WiFi or iPhone Bluetooth tethering
- 🔐 **QR Code Auth** - Easy Spotify login via QR code scan
- 💾 **Persistent Settings** - Survives reboots (tokens, button mappings)
- 🌙 **Power Menu** - Shutdown, reboot, brightness control

## Target Device

- **Spotify Car Thing** running custom firmware (e.g., [superbird-tool](https://github.com/bishopdynamics/superbird-tool))
- **Chrome 64** browser (requires legacy polyfills)
- **800x480** fixed resolution display
- **Physical buttons**: 1-4 presets, M (menu/lock), Back, Dial (knob)

## Quick Start

```bash
# Install dependencies
npm install

# Development server (port 7777)
npm run dev

# Build for production
npm run build

# Type check
npx vue-tsc --noEmit
```

## Deployment to Device

```bash
# Build and deploy to Car Thing (recommended)
./sync-to-device.sh

# Deploy only (skip build, use existing dist/)
./sync-to-device.sh --skip-build
```

The deploy script handles:
- Building the project
- Preserving `settings.json` across deploys
- Clearing browser cache while keeping auth tokens
- Making `save-settings.sh` executable

**Device IPs:**
- Host PC: `172.16.42.1`
- Car Thing: `172.16.42.2`

## Spotify Auth Relay (Optional)

If you want to use your own Spotify Client ID instead of the shared one, you need to host the `spotify-relay.php` file on an HTTPS server.

### Setup

1. Upload `spotify-relay.php` to your HTTPS web server
2. Create a Spotify App at https://developer.spotify.com/dashboard
3. Set the Redirect URI to your relay URL (e.g., `https://yourdomain.com/spotify-relay.php`)
4. Copy your Client ID and set in `.env`:

```bash
VITE_SPOTIFY_CLIENT_ID=your_32_char_client_id
VITE_AUTH_RELAY_URL=https://yourdomain.com/spotify-relay.php
```

### Relay Endpoints

| Endpoint | Description |
|----------|-------------|
| `?action=test` | Test relay is working, returns `{"status":"ok"}` |
| `?action=start&client_id=XXX&session=YYY&code_challenge=ZZZ` | Start auth flow, returns Spotify auth URL for QR code |
| `?action=check&session=YYY` | Poll for auth code after user authorizes |

### How It Works

1. Device calls `?action=start` with client ID, session ID, and PKCE code challenge
2. Relay returns Spotify authorization URL (displayed as QR code)
3. User scans QR, authorizes on Spotify
4. Spotify redirects to relay with auth code
5. Relay stores code, shows success page to user
6. Device polls `?action=check` until code is available
7. Device exchanges code for tokens locally (keeps code_verifier secret)

## Directory Structure

```
nocturne-vue/src/
├── App.vue                 # Root component with sidebar, power menu, M button handling
├── main.ts                 # Entry point with Pinia + Router
├── index.css               # Tailwind + custom styles (EXACT copy from React)
│
├── components/
│   ├── auth/
│   │   └── QRCodeDisplay.vue    # QR code for Spotify PKCE auth
│   ├── common/
│   │   ├── icons/               # SVG icon components (NocturneIcon, WifiIcon, etc.)
│   │   ├── GradientBackground.vue
│   │   ├── LoadingScreen.vue
│   │   ├── PowerMenuOverlay.vue # Shutdown/Reboot/Brightness controls
│   │   ├── ScrollingText.vue
│   │   └── ButtonMappingOverlay.vue
│   ├── content/
│   │   ├── MediaCard.vue        # Reusable album/playlist/artist card
│   │   └── HorizontalScroll.vue # Scrollable row with keyboard nav
│   ├── layout/
│   │   └── Sidebar.vue          # Navigation sidebar
│   └── player/
│       └── ProgressBar.vue      # Playback progress with seek
│
├── views/
│   ├── recents/index.vue        # Recently played albums
│   ├── library/index.vue        # User playlists + liked songs
│   ├── artists/index.vue        # Top artists
│   ├── radio/index.vue          # Featured playlists (was DJ mixes)
│   ├── podcasts/index.vue       # User's shows
│   ├── settings/index.vue       # App settings, logout
│   ├── now-playing/index.vue    # Full-screen player with controls
│   ├── lock/index.vue           # Black screen (M button short press)
│   ├── auth/
│   │   ├── login.vue            # QR code auth screen
│   │   ├── callback.vue         # OAuth callback handler
│   │   └── network.vue          # WiFi/Bluetooth settings
│   ├── album/index.vue          # Album detail with track list
│   ├── artist/index.vue         # Artist detail
│   └── show/index.vue           # Podcast show detail
│
├── stores/
│   ├── auth.ts                  # PKCE OAuth, token management
│   ├── spotify.ts               # Spotify API calls, playback state
│   ├── ui.ts                    # UI state (activeSection, gradients)
│   └── config.ts                # Environment detection, feature flags
│
├── composables/
│   ├── useBluetooth.ts          # Bluetooth device management with auto-reconnect
│   ├── useWiFiNetworks.ts       # WiFi scanning/connecting via Connector API
│   ├── useButtonMapping.ts      # Preset button (1-4) long-press mapping
│   └── useButtonAction.ts       # Button press/release handlers
│
├── router/
│   └── index.ts                 # Vue Router routes
│
└── types/
    ├── index.ts                 # Type exports
    └── spotify.types.ts         # Spotify API types
```

## Key Features

### Authentication
- **PKCE OAuth flow** with device code (QR code scan)
- Tokens stored in `settings.json` (file-based persistence survives reboots)
- Auto-refresh before expiry

### Settings Persistence
- All settings stored in `/etc/nocturne/ui/settings.json` on device
- Uses `save-settings.sh` script via nocturned `/device/exec` endpoint
- In dev mode, falls back to localStorage
- Settings include: auth tokens, button mappings, UI preferences

### Playback
- Real-time playback state polling
- Play/Pause, Skip, Previous, Shuffle, Repeat
- Dial seek (knob rotation = ±10s seek)
- Progress bar with touch/click seek

### Button Mapping (Presets 1-4)
- **Short press**: Play mapped content
- **Long press (2s)**: Save current playing context to button
- Stored in localStorage (`button1Id`, `button1Type`, etc.)

### Power Menu (M Button)
- **Short press**: Toggle lock screen (black display)
- **Long press (600ms)**: Show power menu
  - Shutdown / Reboot buttons
  - Brightness slider (1-220)
  - Auto-brightness toggle

### Network Settings
- **WiFi**: Requires Nocturne Connector on Raspberry Pi (`172.16.42.1:20574`)
  - Scan networks, connect with password, forget networks
- **Bluetooth**: Via nocturned daemon (`localhost:5000`)
  - Auto-reconnect every 2 seconds (infinite retry)
  - Show network screen after 5 seconds of no connection
  - Long press (800ms) to forget device

## Environment Variables

The app works out of the box with a shared Spotify Client ID (device auth flow). You only need to set environment variables if you want to use your own Client ID.

```bash
# .env (optional - only if using your own Spotify app)
VITE_SPOTIFY_CLIENT_ID=your_32_char_client_id      # Your own Client ID
VITE_AUTH_RELAY_URL=https://yourdomain.com/spotify-relay.php  # Your relay URL

# Default behavior (no .env needed):
# - Uses shared Client ID: 65b708073fc0480ea92a077233ca87bd
# - Uses Spotify Device Authorization flow (QR code scan)
# - No relay server required
```

## API Endpoints

### Nocturned (localhost:5000)
- `GET /bluetooth/devices` - List paired devices
- `POST /bluetooth/connect/:address` - Connect to device
- `POST /bluetooth/disconnect/:address` - Disconnect device
- `POST /bluetooth/remove/:address` - Forget/unpair device
- `POST /bluetooth/discover/on` - Start discovery
- `POST /bluetooth/discover/off` - Stop discovery
- `GET /device/brightness` - Get brightness state
- `POST /device/brightness/:value` - Set brightness (1-220)
- `POST /device/brightness/auto` - Toggle auto-brightness
- `POST /device/power/shutdown` - Shutdown device
- `POST /device/power/reboot` - Reboot device

### Connector API (172.16.42.1:20574)
- `GET /network` - Network status
- `GET /network/scan` - Scan WiFi networks
- `GET /network/list` - List saved networks
- `POST /network/connect` - Connect to network
- `POST /network/select/:id` - Select saved network
- `DELETE /network/remove/:id` - Forget network

## Build Configuration

### Vite Config (`vite.config.ts`)
- **Legacy plugin** for Chrome 64 polyfills
- Port 7777 for dev server
- `@` alias for `src/`

### TypeScript
- Strict mode enabled
- Path aliases configured

## Known Differences from React Version

1. **No WebSocket** for real-time network updates (polls on mount only)
2. **Simpler reconnection** - just retries every 2s vs complex backoff
3. **Vue reactivity** - uses `ref()` instead of `useState()`
4. **Pinia** instead of React Context for global state

## Development Notes

- Always use `<script setup lang="ts">` for components
- Use Pinia stores for shared state, composables for reusable logic
- Icons are simple Vue components with `currentColor` for styling
- All CSS classes match React version exactly for visual parity
