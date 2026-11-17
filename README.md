# Spotify Overlay — Player + Lyrics

A floating mini-player with **live synced lyrics** for the Spotify Web Player (open.spotify.com).
No Spotify API key and no Premium needed. It also works with Spotify installed as a web app from Brave or Chrome.

It has three ways to show, and you pick per moment:

| Mode | Where it shows | What you need |
| --- | --- | --- |
| **1. In-browser overlay** | On top of **every browser tab**, not just Spotify | The extension |
| **2. Popup window** | The browser's always-on-top Picture-in-Picture popup. It stays visible over other apps too. | The extension |
| **3. Desktop overlay** | A transparent, frameless overlay floating over every app (pill, glow and lyrics panel), with clicks passing through around it | The extension **+** the optional desktop add-on (Windows) |

**Features:**
- Album art on a pitch-black card with a dim dark-green edge glow and Spotify-green accents.
- Play/pause, previous/next, shuffle, repeat, seek and volume.
- Synced lyrics: a scrolling panel with autoscroll and **Resume Autoscroll**, click-to-seek, and per-song timing nudge.
- Compact mode.
- Auto-shrink to a pill when the mouse leaves, with a pin to keep it expanded.

---

## Requirements

- A Chromium browser, version 116 or newer: **Brave**, Chrome, Edge or Chromium.
- For mode 3 only:
  - Windows 10/11 with the WebView2 runtime (built into Windows 11).
  - *Smart App Control* turned off. See [Troubleshooting](#troubleshooting).

## 1. Get the code

```bash
git clone https://github.com/RudranshVerma23/SpotifyOverlay.git
```

…or on GitHub click **Code → Download ZIP** and unzip it anywhere.

## 2. Install the extension (modes 1 and 2)

1. Open `brave://extensions` (or `chrome://extensions`, `edge://extensions`).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the `SpotifyOverlay` folder, the one containing `manifest.json`.
   - The extension ID shown should be `lljlekkhndmkhaeehamdpfagfgjagend`.
   - Because the overlay can appear on every site, the browser says the extension can "read and change data on all websites". It only draws the overlay there; it doesn't read pages.
4. Refresh Spotify and any tabs that were already open.
5. If you had other Spotify mini-player or lyrics extensions installed, disable them to avoid duplicate buttons.

That's all modes 1 and 2 need.

## 3. (Optional) Install the desktop add-on (mode 3)

A tiny app (~3 MB) that the browser starts **only when you choose the desktop overlay**.
It quits by itself when you close the overlay, the Spotify tab or the browser.
It is never added to startup and never runs in the background.

### Option A — download (recommended)

1. Download **[SpotifyOverlay-desktop.zip](https://github.com/RudranshVerma23/SpotifyOverlay/releases/latest/download/SpotifyOverlay-desktop.zip)** from the [latest release](https://github.com/RudranshVerma23/SpotifyOverlay/releases/latest).
   It contains `SpotifyOverlay.exe`, `install.cmd` and `uninstall.cmd`.
2. Unzip it into any folder you'll keep, for example `Documents\SpotifyOverlay-desktop`.
   If Windows shows a "Windows protected your PC" warning the first time, click **More info → Run anyway**: the exe isn't code-signed.

### Option B — build it from source

1. Install Rust from <https://rustup.rs>, using one of these toolchains:
   - **MSVC** (rustup's default): also install *Visual Studio Build Tools* with the "Desktop development with C++" workload.
   - **GNU**: if you have MSYS2/MinGW `gcc`, run `rustup default stable-x86_64-pc-windows-gnu`. `build.cmd` finds MSYS2's gcc in `C:\msys64\ucrt64\bin` by itself.
2. Run `desktop\build.cmd`. The first build takes about 10 minutes; later builds take about 2. It creates `desktop\SpotifyOverlay.exe` next to `install.cmd`.

### Register it (once, either option)

1. Run `install.cmd`: from the unzipped folder (Option A) or from `desktop\` (Option B).
   - It writes `com.spotify_overlay.desktop.json` next to the exe.
   - It adds a **per-user** registry entry so Brave, Chrome, Edge and Chromium can find the exe. No admin rights are needed.
   - Paths are relative to the folder, so it works wherever you put it. **If you move the folder, run `install.cmd` again.**
2. **Fully exit the browser once** (☰ menu → **Exit**, or right-click its tray icon → **Exit**), then reopen it.
   Closing the windows isn't enough: Brave keeps running in the background and won't see the new add-on until it really restarts.

To remove it, run `uninstall.cmd` from the same folder, then delete the folder.

---

## Using it

### Opening and closing

- Click the **screen-with-note button** in Spotify's bottom-right player bar, just left of the Lyrics (mic) button.
- The extension's **toolbar icon** also toggles the overlay, from any tab.
- It never opens by itself.

### Mode 1: in-browser overlay (every tab)

1. Open the overlay as above. It appears on Spotify **and on every other tab** you switch to, at the same spot and in the same state.
2. **Drag** it by any empty spot. The position is remembered and shared by all tabs.
3. When the mouse leaves, it shrinks to a **pill** with moving equalizer bars and the song title. Hover to expand it again, or click 📌 to keep it expanded.

Only the tab you're looking at is connected, so background tabs cost nothing.
It can't appear on browser pages such as `brave://` pages, the New Tab page or the extension store.

### Mode 2: popup window (over other apps, no add-on)

1. Click **↗** in the overlay's top-right corner, from any tab.
2. An always-on-top popup opens with the same player and lyrics. It stays visible when you switch tabs or go to other apps.
3. While the popup is open, the in-tab overlays hide.
4. Click **↙** in the popup to put the overlay back into your tabs, or **✕** to close it.
5. The popup belongs to the tab that opened it, so closing that tab closes the popup.

### Mode 3: desktop overlay (needs the add-on)

1. Click **🖥** in the overlay's top-right corner.
2. The overlay moves into a transparent, frameless window floating over every app, with the pill, glow and lyrics panel. Clicks pass through everywhere except the overlay itself.
3. Drag it by the card's empty space or by the pill. It remembers where you left it.
4. Click **↙** to bring it back into the browser, or **✕** to close it. The add-on then quits.

### Controls (all modes)

| Control | What it does |
| --- | --- |
| Progress bar | Click or drag to seek |
| 🔊 Volume (under the album art) | Click or drag; scroll over it to adjust; click the speaker to mute |
| Shuffle / ⏮ / ⏯ / ⏭ / Repeat | Same as Spotify's buttons; shuffle and repeat light up when on |
| **♫** | Opens the lyrics panel. Scroll it yourself to pause autoscroll, then use **Resume Autoscroll**. Click a line to jump there (timed lyrics only). Hovering the panel shows a few buttons at its bottom-left — see the next row. |
| Lyrics panel buttons (on hover) | **Retry** searches again. **Wrong lyrics? (1/3)** switches to the next match, and only appears when more than one match was found. **Show lyrics** only appears for a song whose lyrics were hidden in an earlier version. |
| **LYRICS SYNC − / +** | Shift this song's lyrics 0.5 s later or earlier; remembered per song |
| **COMPACT MODE →** | Slim strip with the current lyric line, play/pause and next. It stays as it is until you exit with ⤢. |
| **📌** | Keep the overlay expanded (no shrinking to the pill) |
| Card's left / right edge | Drag to make the overlay wider, so long lyric lines fit. The width is remembered and shared by every tab and the desktop overlay. In the popup window, resize the window itself instead. |

---

## Troubleshooting

- **"Desktop overlay add-on isn't set up yet"**: run `install.cmd` (in the add-on's folder). Do this again whenever you move the folder.
- **"couldn't start: Error when communicating with the native messaging host"**: fully exit the browser (☰ → **Exit**, or tray icon → **Exit**) and reopen it.
  - Turning off *Settings → System → Continue running background apps* prevents this from happening.
- **Windows won't run `SpotifyOverlay.exe`** ("An Application Control policy has blocked this file"): Windows 11's *Smart App Control* blocks every unsigned program, including ones you build yourself.
  - Turn it off in Windows Security → App & browser control → Smart App Control. It has no per-app exceptions.
  - Modes 1 and 2 don't need this.
- **The overlay doesn't show on a tab**: refresh that tab. Tabs opened before the extension was installed or reloaded don't have it yet.
- **Missing lyrics**: hover the lyrics panel and click **Retry**. Lyrics come from LRCLIB, and some songs aren't there.
- **Wrong lyrics**: if more than one match was found, hover the panel and click **Wrong lyrics?** to cycle through them. If the button doesn't appear, only one match exists; **LYRICS SYNC − / +** fixes timing that's merely off.
- **Desktop add-on diagnostics:** `desktop.log`, next to `SpotifyOverlay.exe`, records each start and exit.

## Updating

```bash
git pull
```

Then:
1. Reload the extension in `brave://extensions` and refresh your tabs.
2. If you use the desktop add-on, close the desktop overlay, then:
   - **Downloaded it:** get the new [SpotifyOverlay-desktop.zip](https://github.com/RudranshVerma23/SpotifyOverlay/releases/latest/download/SpotifyOverlay-desktop.zip) and unzip it over the old folder.
   - **Built it:** run `desktop\build.cmd` again.

   Either way, you only need to re-run `install.cmd` if you moved the folder.

---

## How it fits together

```
                       ┌──── other tabs (mirror.js) — modes 1 & 2: show the overlay, send clicks back
Spotify tab ──port──► background service worker
(content.js:            finds + times lyrics, relays the overlay
 reads the player,     └──── native messaging ──► SpotifyOverlay.exe — mode 3: transparent window
 runs its buttons)
```

| Path | Role |
| --- | --- |
| `content/spotify-dom.js` | Every Spotify DOM selector and control. Edit this when Spotify changes its UI. |
| `content/content.js` | Spotify tab: playback position, player-bar button, overlay modes, relaying to tabs and the desktop. |
| `content/mirror.js` | Every other tab: shows the overlay and can open the popup (mode 2). |
| `content/overlay-view.js` | The overlay UI, shared by every mode. The desktop add-on embeds this same file at build time. |
| `content/main-world.js` | Dormant hook that can reuse the lyrics Spotify's own player downloads. Off by default, with no UI switch. |
| `background/service-worker.js` | Lyrics lookup and line timing; relays the overlay to tabs; launches the desktop add-on. |
| `lib/` | Lyrics search and parsing (LRCLIB), line clock, storage. |
| `desktop/` | Tauri desktop add-on: `src/main.rs`, `ui/`, and `build` / `install` / `uninstall` scripts. |

The extension ID is fixed by the `key` in `manifest.json` (`lljlekkhndmkhaeehamdpfagfgjagend`), and `desktop/install.cmd` allows exactly that ID.
If you fork the project with a different key, update `EXT_ID` in `install.cmd`.

Lyrics come from [LRCLIB](https://lrclib.net), a free and open lyrics database.
