<div align="center">

<img src="icons/icon128.png" alt="Sonavia icon" width="80" height="80" />

# Sonavia

**A floating Spotify mini-player with live synced lyrics, in every tab, a popup window, or on top of any app.**
No API key. No Premium. No login.

[![Brave / Chrome](https://img.shields.io/badge/Brave%20%7C%20Chrome%20%7C%20Edge-Extension-1DB954?style=flat-square&logo=googlechrome&logoColor=white)](#-installation)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-1DB954?style=flat-square)](manifest.json)
[![Version](https://img.shields.io/badge/version-1.5.0-1DB954?style=flat-square)](manifest.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-1DB954?style=flat-square)](LICENSE)

<br/>

<img src="docs/screenshots/lyrics.png" alt="Player with synced lyrics floating over a web page" width="420" />

<br/><br/>

[**⬇️ Desktop add-on**](https://github.com/RudranshVerma23/Sonavia/releases/latest) &nbsp;·&nbsp; [**🚀 Install**](#-installation) &nbsp;·&nbsp; [**🎮 Usage**](#-usage)

</div>

---

## ✨ What It Does

Sonavia adds a button to the Spotify Web Player (`open.spotify.com`, or Spotify installed as a web app). It opens a compact player with synced lyrics that you can show in three places:

| Mode | Where it shows | Needs |
|---|---|---|
| **In-browser** | On top of every browser tab | Extension |
| **Popup** | Always-on-top Picture-in-Picture window | Extension |
| **Desktop** | Transparent overlay above every app; clicks pass through around it | Extension + desktop add-on (Windows) |

---

## 🎯 Features

| Feature | Details |
|---|---|
| 🎵 Playback | Play/pause, previous/next, shuffle, repeat, seek, volume and mute |
| 🎤 Synced lyrics | Auto-scrolling panel, click a line to seek, per-song timing offset |
| 🫧 Auto-collapse | Shrinks to a small circle; shows the song title when the mouse is near |
| ⏱️ Focus mode | Focus/break timer with a progress ring, chime, and a Tasks & Goals list |
| 📐 Compact mode & resize | Slim one-line strip; drag the side edges to widen the card, or a bottom corner to scale the whole overlay |
| 📌 Pin | Keep it expanded |
| 🔒 Private | No account, no analytics; lyrics come from [LRCLIB](https://lrclib.net) |

<p align="center">
  <img src="docs/screenshots/player.png" alt="Player card" height="150" />
  <img src="docs/screenshots/focus.png" alt="Focus mode with tasks" height="150" />
  <img src="docs/screenshots/pill.png" alt="Collapsed title pill" height="150" />
</p>

---

## 🚀 Installation

**Requirements:** Brave, Chrome, Edge or Chromium 116+. The desktop add-on also needs Windows 10/11.

### 1. Extension

1. Download the code: `git clone https://github.com/RudranshVerma23/Sonavia.git` (or **Code → Download ZIP**).
2. Open `brave://extensions` (or `chrome://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and select the `Sonavia` folder.
4. Refresh any open tabs.

### 2. Desktop add-on *(optional)*

A ~3 MB app that starts only when you choose the desktop overlay, and quits when it closes. It never runs at startup.

1. Download [**Sonavia-desktop.zip**](https://github.com/RudranshVerma23/Sonavia/releases/latest/download/Sonavia-desktop.zip) and unzip it into a folder you'll keep.
2. Run `install.cmd` (per-user, no admin). Run it again if you move the folder.
3. **Fully exit the browser once** (menu → **Exit**) and reopen it.

<details>
<summary>Build the add-on from source instead</summary>

1. Install Rust from [rustup.rs](https://rustup.rs), with either the MSVC toolchain (plus Visual Studio Build Tools, "Desktop development with C++") or the GNU toolchain with MSYS2 `gcc`.
2. Run `desktop\build.cmd`, then `desktop\install.cmd`.

</details>

To remove it, run `uninstall.cmd` and delete the folder.

---

## 🎮 Usage

Play something on Spotify, then click the **overlay button** in the player bar (left of the Lyrics button) or the extension's toolbar icon. It never opens by itself.

| Control | Action |
|---|---|
| **↗** / **🖥** / **↙** | Move to the popup window / desktop overlay / back into the browser |
| **♫** | Lyrics panel. Scroll to pause autoscroll; click a line to seek |
| **LYRICS SYNC − / +** | Shift this song's lyrics by 0.5 s |
| **COMPACT MODE** | One-line strip; exit with ⤢ |
| **FOCUS MODE** | Timer view. ⚙ sets lengths and chime, ☑ opens Tasks & Goals |
| **📌** | Keep expanded |
| Card side edges | Drag to make it wider or narrower |
| Bottom corners | Drag outward / inward to make the whole overlay bigger / smaller (70–160%); double-click to reset |
| Empty space | Drag to move (position is remembered) |

**Focus mode:** ⏭ during focus asks *Continue session?*; answering no (or waiting 5 s) starts the break. In Tasks & Goals, right-click a task to change its priority and middle-click to make it the active goal. Keep the Spotify tab open, since it runs the timer.

---

## 🔧 Troubleshooting

| Problem | Fix |
|---|---|
| Overlay missing on a tab | Refresh the tab |
| "Desktop add-on isn't set up" | Run `install.cmd` |
| "Error when communicating with the native messaging host" | Fully exit the browser and reopen it |
| Windows blocks `Sonavia.exe` | Turn off *Smart App Control* (the exe is unsigned) |
| Missing or wrong lyrics | Hover the lyrics panel and use **Retry** or **Wrong lyrics?** |

**Updating:** `git pull`, reload the extension and refresh tabs. For the add-on, download the new zip (or rebuild).

**Coming from Spotify Overlay (v1.4 or older)?** The project is now Sonavia. Reload the extension, then replace the desktop add-on with the new zip and run its `install.cmd` (it also removes the old registration). Fully exit the browser once and reopen it.

---

## 📦 Project Structure

```
Sonavia/
├── manifest.json
├── background/service-worker.js   ← lyrics lookup, relay to tabs and desktop
├── content/
│   ├── content.js                 ← Spotify tab: state, modes, focus timer
│   ├── spotify-dom.js             ← all Spotify selectors (edit when Spotify changes)
│   ├── overlay-view.js            ← overlay UI shared by every mode
│   └── mirror.js                  ← overlay on non-Spotify tabs
├── lib/                           ← LRCLIB search, line clock, storage
└── desktop/                       ← Tauri add-on (Rust + same overlay UI)
```

---

## 📄 License

[MIT](LICENSE) © 2026 Rudransh Verma. Not affiliated with or endorsed by Spotify.
