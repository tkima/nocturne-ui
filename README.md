# Nocturne UI (Vue Edition)

**A modern Vue 3 rewrite of the Nocturne Spotify player for Spotify Car Thing devices.**

> Full-featured Spotify controller for jailbroken Car Thing devices with a beautiful, responsive UI.

> **Privacy-friendly, no-companion-app fork.** Stays on the v3.0.0 tether approach: internet over iPhone Personal Hotspot (Bluetooth NAP), Spotify auth via on-device QR code, **zero telemetry**, no mobile app required. The upstream Nocturne project moved in a different direction — this fork keeps it tether-only and private.

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

### Step 2: Install Vue Edition

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

This is a complete and stable rewrite of the original React-based Nocturne UI in **Vue 3** with:
- **Vue 3** with Composition API (`<script setup>`)
- **TypeScript** for type safety
- **Pinia** for state management
- **Vue Router** for navigation
- **Tailwind CSS** (exact same CSS as React version)

## Features

- **Full Spotify Control** - Play/pause, skip, shuffle, repeat, seek
- **Browse Library** - Recently played, playlists, liked songs, artists, podcasts, queue
- **Artist Radio** - Play artist radio with related-artist mixing, cached track pool, and persisted duplicate skip
- **Blocklist** - Block/unblock songs, auto-skip blocked tracks, manage list in Settings
- **Preset Buttons** - Map albums/playlists/artists to physical buttons (1-4) via long-press
- **Configurable Wheel** - Choose what wheel turn and wheel press do on Now Playing
- **WiFi Setup** - Scan/connect/forget Wi-Fi networks via the Connector API
- **QR Code Auth** - Spotify Device Authorization flow (no relay needed) or custom PKCE via relay
- **Persistent Settings** - All settings + auth tokens stored in `settings.json` on device
- **Power Menu** - Shutdown, reboot, manual + auto brightness

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
├── index.css               # Tailwind + custom styles
│
├── components/
│   ├── auth/
│   │   └── QRCodeDisplay.vue        # QR code for Spotify auth
│   ├── common/
│   │   ├── icons/                   # SVG icon components
│   │   ├── ButtonMappingOverlay.vue # Long-press preset assignment dialog
│   │   ├── DebugOverlay.vue         # On-device debug log viewer
│   │   ├── GradientBackground.vue
│   │   ├── LoadingScreen.vue
│   │   ├── MediaListView.vue        # Album/playlist track listing
│   │   ├── PowerMenuOverlay.vue     # Shutdown / Reboot / Brightness
│   │   ├── ToastMessage.vue
│   │   └── VirtualKeyboard.vue
│   ├── content/
│   │   ├── HorizontalScroll.vue
│   │   ├── LoadingCard.vue
│   │   └── MediaCard.vue
│   ├── layout/
│   │   └── Sidebar.vue
│   └── player/
│       └── ProgressBar.vue
│
├── views/
│   ├── recents/index.vue            # Recently played
│   ├── library/index.vue            # Playlists
│   ├── liked-songs/index.vue        # Liked Songs
│   ├── playlist/index.vue           # Playlist detail
│   ├── artists/index.vue            # Top artists
│   ├── artist/index.vue             # Artist detail
│   ├── album/index.vue              # Album detail
│   ├── radio/index.vue              # Artist radio stations
│   ├── podcasts/index.vue           # User shows
│   ├── show/index.vue               # Show detail
│   ├── queue/index.vue              # Playback queue
│   ├── now-playing/index.vue        # Full-screen player
│   ├── lock/index.vue               # Lock screen (M-button short press)
│   ├── settings/index.vue           # Settings + blocklist + account
│   ├── test/index.vue               # API test page (Debug section)
│   └── auth/
│       ├── login.vue                # QR-code auth
│       ├── callback.vue             # OAuth callback handler
│       └── network.vue              # Wi-Fi setup
│
├── stores/
│   ├── auth.ts                      # Spotify auth (Device flow + PKCE)
│   ├── boot.ts                      # Boot sequencing
│   ├── spotify.ts                   # Spotify API + playback state
│   ├── ui.ts                        # UI state (gradients, overlays)
│   └── config.ts                    # Environment + env-var flags
│
├── composables/
│   ├── useSettings.ts               # settings.json persistence via /device/exec
│   ├── useNetwork.ts                # Connectivity polling
│   ├── useWiFiNetworks.ts           # Wi-Fi scan/connect via Connector API
│   ├── useButtonAction.ts           # Click debounce wrapper
│   ├── useButtonMapping.ts          # Preset button (1-4) long-press mapping
│   ├── useGlobalKeys.ts             # Global keyboard / preset routing
│   ├── useHeartbeat.ts              # Periodic ping
│   ├── useListNavigation.ts         # Arrow-key list navigation + Enter
│   └── useToast.ts                  # Toast notifications
│
├── router/
│   └── index.ts                     # Vue Router routes
│
└── types/
    ├── index.ts                     # Type exports
    └── spotify.types.ts             # Spotify API types
```

## Key Features

### Authentication
- **Spotify Device Authorization** (default): scan QR, authorize on phone, tokens land on device — no relay needed
- **PKCE flow** (optional): used when a custom `VITE_SPOTIFY_CLIENT_ID` is set; needs the `spotify-relay.php` relay
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
- Previous under 10s into the song jumps to the previous track; 10s+ restarts the current track
- Configurable wheel — see [Wheel Customization](#wheel-customization)
- Swipe left/right on Now Playing to skip tracks (toggleable)
- Progress bar with touch/click seek
- Optimistic play/pause UI update (instant visual feedback)

### Wheel Customization

Two settings under **Settings → Playback** control the dial behavior on Now Playing:

| Setting | Options | Default |
|---------|---------|---------|
| **Wheel Turn** | Previous / Next song · Seek ±10s | Previous / Next song |
| **Wheel Press** | Seek +10s · Next song · Play / Pause | Seek +10s |

Both actions are debounced so a wheel spin only fires once.

### Artist Radio
- Builds radio stations from your top artists (recents + liked songs)
- Mixes in related artist tracks via a cached track pool (~50 tracks)
- Pool auto-refills when below 30 tracks (minimal API calls)
- Skips duplicate tracks (last 15 track history, persisted to settings so it survives reboots)
- Tracks artist/track history for played songs (>20s)

### Blocklist
- Block/unblock songs from Now Playing (long-press block icon)
- Auto-skips blocked tracks when they come up
- Blocked tracks filtered from radio pool
- Manage blocked songs in Settings

### Button Mapping (Presets 1-4)
- **Short press**: Play mapped content (album/playlist/artist)
- **Long press (~2s)**: Save current playing context to that button
- Stored in `settings.json` under `buttonMappings` (4-slot array) — survives reboots

### Power Menu (M Button)
- **Short press**: Toggle lock screen (black display)
- **Long press (600ms)**: Show power menu
  - Shutdown / Reboot buttons
  - Brightness slider (1-220)
  - Auto-brightness toggle

### Settings Exposed in UI

| Setting | Section | Default | Description |
|---------|---------|---------|-------------|
| **Start with Now Playing** | General | Off | Boot directly into Now Playing instead of Radio |
| **Track Name Scrolling** | Playback | On | Animate long track/artist names |
| **Swipe to Change Song** | Playback | On | Swipe left/right on Now Playing skips tracks |
| **Wheel Turn** | Playback | Prev/Next | See [Wheel Customization](#wheel-customization) |
| **Wheel Press** | Playback | Seek +10s | See [Wheel Customization](#wheel-customization) |
| **Wi-Fi** | Network | — | Open Wi-Fi setup screen |
| **Blocked Songs** | Blocklist | — | Manage blocked tracks |
| **Debug Overlay** | Debug | Off | On-screen log viewer with category filter |
| **API Test Page** | Debug | — | Test Spotify endpoints |

Settings are stored in `/etc/nocturne/ui/settings.json` and persist across reboots.

### Network Settings

- **Wi-Fi**: Scan, connect, and forget Wi-Fi networks via the Nocturne Connector API on `172.16.42.1:20574`.
- **Bluetooth tethering** (iPhone Personal Hotspot): handled at the **system level** — `nocturned` pairs the device, and `public/bt-connect.sh` runs `nmcli device connect` and then deletes the auto-created NAP profile to keep iOS from disconnecting. The Vue app does not include an in-app Bluetooth pairing/device-list screen; on boot, the network component just pings twice in a row to wait for a stable tether before continuing.

## Environment Variables

The app works out of the box with a shared Spotify Client ID via the Device Authorization flow. `.env` is only needed if you want to use your own Spotify app or change runtime flags.

```bash
# Auth (optional - falls back to the shared Client ID)
VITE_SPOTIFY_CLIENT_ID_SHARED=65b708073fc0480ea92a077233ca87bd
VITE_SPOTIFY_CLIENT_ID=                                          # Your own Client ID (enables PKCE flow)
VITE_AUTH_RELAY_URL=https://yourdomain.com/spotify-relay.php     # Required if using PKCE flow
VITE_REDIRECT_URI=                                               # Override OAuth callback URL (rarely needed)

# Dev / debug
VITE_DEBUG_ENABLED=false           # true = debug logging system enabled (overlay toggleable in Settings)
VITE_SKIP_TUTORIAL=true            # Skip tutorial screen
VITE_ANALYTICS_ENABLED=false       # Reserved
VITE_WIFI_NETWORKS=                # JSON array of known SSIDs/passwords for auto-fill on Wi-Fi screen
```

Default behavior (no `.env` needed): shared Client ID, Device Authorization flow, no relay.

## API Endpoints

Endpoints the Vue app currently calls. (Nocturned exposes more — including `/bluetooth/*` — but those are not used by this UI.)

### Nocturned (`127.0.0.1:5000`)
- `GET /device/brightness` — Get current brightness + auto-brightness state
- `POST /device/brightness/:value` — Set brightness (1-220)
- `POST /device/brightness/auto` — Toggle auto-brightness
- `POST /device/power/shutdown` — Shutdown
- `POST /device/power/reboot` — Reboot
- `POST /device/exec` — Run shell commands on device (used for `save-settings.sh` and `bt-connect.sh`)
- `POST /device/resetcounter` — Reset boot/idle counter on the loading screen

### Connector API (`172.16.42.1:20574`)
- `GET /network` — Network status
- `GET /network/scan` — Scan Wi-Fi networks
- `GET /network/list` — List saved networks
- `POST /network/connect` — Connect to network
- `POST /network/select/:id` — Select saved network
- `DELETE /network/remove/:id` — Forget network

## Build Configuration

### Vite Config (`vite.config.ts`)
- **Legacy plugin** for Chrome 64 polyfills
- Port 7777 for dev server
- `@` alias for `src/`

### TypeScript
- Strict mode enabled
- Path aliases configured

## Development Notes

- Always use `<script setup lang="ts">` for components
- Use Pinia stores for shared state, composables for reusable logic
- Icons are simple Vue components with `currentColor` for styling
