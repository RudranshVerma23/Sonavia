// Sonavia — desktop app.
//
// Brave starts this program on demand through native messaging (only when
// you send the overlay to the desktop) and talks to it over stdin/stdout:
// every message is a 4-byte little-endian length followed by JSON.
// When the overlay is closed, Brave closes stdin and the app exits.
//
// It is deliberately a console-subsystem program: Brave launches native
// hosts hidden with their stdio piped, which is what we need.
//
// The window is transparent, borderless, always on top and covers the main
// screen (less the taskbar). The page draws the overlay in it exactly as in a
// web page: a circle, and the player when it's opened. Mouse input only
// "sticks" to those parts; everywhere else clicks fall through to the app
// underneath (the page reports where they are drawn).

use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewWindow};

/// Tiny diagnostics log, `desktop.log` next to the exe (kept small).
/// Not under %LOCALAPPDATA%: browsers may launch us without that variable.
fn log(line: &str) {
    let Some(file) = std::env::current_exe().ok().and_then(|e| e.parent().map(|d| d.join("desktop.log"))) else {
        return;
    };
    if std::fs::metadata(&file).map(|m| m.len() > 64 * 1024).unwrap_or(false) {
        let _ = std::fs::remove_file(&file);
    }
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(file) {
        let _ = writeln!(f, "[{secs}] {line}");
    }
}

/// A part of the overlay drawn in the window, in CSS pixels.
#[derive(Clone, Copy, Default, serde::Deserialize)]
struct HitRect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

struct Shared {
    hits: Arc<Mutex<Vec<HitRect>>>,
    out: Mutex<std::io::Stdout>,
    /// The mouse button is down on the overlay: it keeps the mouse until released.
    held: Arc<AtomicBool>,
}

fn write_message(out: &mut std::io::Stdout, msg: &Value) -> std::io::Result<()> {
    let body = serde_json::to_vec(msg)?;
    out.write_all(&(body.len() as u32).to_le_bytes())?;
    out.write_all(&body)?;
    out.flush()
}

/// A button press in the overlay → back to the extension.
#[tauri::command]
fn send_action(shared: State<Shared>, name: String, arg: Option<Value>) {
    if let Ok(mut out) = shared.out.lock() {
        let _ = write_message(&mut out, &json!({ "type": "action", "name": name, "arg": arg }));
    }
}

/// Where the overlay is drawn: the circle, the player and its panels.
#[tauri::command]
fn set_hit_rects(shared: State<Shared>, rects: Vec<HitRect>) {
    if let Ok(mut hits) = shared.hits.lock() {
        *hits = rects;
    }
}

/// A drag (of the circle, a slider, a knob…) started or ended on the overlay.
#[tauri::command]
fn hold(shared: State<Shared>, on: bool) {
    shared.held.store(on, Ordering::SeqCst);
}

/// Reads the extension's messages from stdin and hands them to the page.
fn pipe_stdin(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut stdin = std::io::stdin().lock();
        loop {
            let mut len = [0u8; 4];
            if stdin.read_exact(&mut len).is_err() {
                break;
            }
            let mut body = vec![0u8; u32::from_le_bytes(len) as usize];
            if stdin.read_exact(&mut body).is_err() {
                break;
            }
            if let Ok(msg) = serde_json::from_slice::<Value>(&body) {
                let _ = app.emit("ext", msg);
            }
        }
        // Brave closed the connection: overlay closed, tab closed or browser quit.
        log("stdin closed - exiting");
        app.exit(0);
    });
}

/// Lets clicks fall through everywhere except on the overlay's parts, and
/// tells the page where the mouse is (it can't see it while clicks pass through).
fn track_cursor(win: WebviewWindow, hits: Arc<Mutex<Vec<HitRect>>>, held: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        let mut inside_before: Option<bool> = None;
        let mut last_xy = (f64::MIN, f64::MIN);
        loop {
            std::thread::sleep(Duration::from_millis(30));
            let (Ok(cursor), Ok(origin), Ok(scale)) = (win.cursor_position(), win.inner_position(), win.scale_factor())
            else {
                continue;
            };
            // Mouse position in the page's coordinates.
            let x = (cursor.x - origin.x as f64) / scale;
            let y = (cursor.y - origin.y as f64) / scale;
            let on_part = hits
                .lock()
                .map(|h| h.iter().any(|r| x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h))
                .unwrap_or(false);
            // While a drag is on, the overlay keeps the mouse even off its parts.
            let inside = held.load(Ordering::SeqCst) || on_part;
            if (x - last_xy.0).abs() > 0.5 || (y - last_xy.1).abs() > 0.5 {
                last_xy = (x, y);
                let _ = win.emit("cursor", (x.round(), y.round()));
            }
            if inside_before != Some(inside) {
                inside_before = Some(inside);
                let _ = win.set_ignore_cursor_events(!inside);
                let _ = win.emit("hover", inside);
            }
        }
    });
}

/// Cover the main screen, less the taskbar.
fn cover_screen(win: &WebviewWindow) {
    let monitor = win.primary_monitor().ok().flatten().or_else(|| win.available_monitors().ok()?.into_iter().next());
    let Some(m) = monitor else {
        log("no monitor found");
        return;
    };
    let area = m.work_area();
    let _ = win.set_position(PhysicalPosition::new(area.position.x, area.position.y));
    let _ = win.set_size(PhysicalSize::new(area.size.width, area.size.height));
}

fn main() {
    log(&format!("start: args={:?}", std::env::args().skip(1).collect::<Vec<_>>()));
    std::panic::set_hook(Box::new(|info| log(&format!("PANIC: {info}"))));
    let hits = Arc::new(Mutex::new(Vec::new()));
    let held = Arc::new(AtomicBool::new(false));
    tauri::Builder::default()
        .manage(Shared { hits: hits.clone(), out: Mutex::new(std::io::stdout()), held: held.clone() })
        .invoke_handler(tauri::generate_handler![send_action, set_hit_rects, hold])
        .setup(move |app| {
            let win = app.get_webview_window("main").expect("main window");
            cover_screen(&win);
            let _ = win.set_ignore_cursor_events(true);
            let _ = win.show();
            pipe_stdin(app.handle().clone());
            track_cursor(win, hits.clone(), held.clone());
            log("window shown");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to start Sonavia");
}
