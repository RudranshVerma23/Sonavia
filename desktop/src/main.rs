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
// The window is transparent, borderless and always on top. Mouse input only
// "sticks" to the visible overlay; everywhere else clicks fall through to
// the app underneath (the page reports where the overlay is drawn).

use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{Emitter, LogicalSize, Manager, PhysicalPosition, State, WebviewWindow, WindowEvent};

const WINDOW_W: i32 = 540;
// Where the overlay sits inside the window (CSS px; see ui/index.html). The
// margin around it is transparent room for the glow, and may go off-screen.
const STAGE_LEFT: f64 = 70.0;
const STAGE_TOP: f64 = 56.0;
const CARD_W: f64 = 400.0; // default / minimum overlay width; the user can widen it
const MAX_CARD_W: f64 = 2400.0;
const WINDOW_H: f64 = 720.0;
/// How much of the card must stay on screen at the bottom edge (CSS px).
const KEEP_VISIBLE: f64 = 70.0;

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
const EDGE_GAP: i32 = 16;

/// Visible overlay area inside the window, in CSS pixels.
#[derive(Clone, Copy, Default)]
struct HitRect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

struct Shared {
    hit: Arc<Mutex<Option<HitRect>>>,
    out: Mutex<std::io::Stdout>,
    dragging: Arc<AtomicBool>,
    /// Current overlay width (CSS px).
    card_w: Arc<AtomicU32>,
    /// Window position when a resize from the left edge began.
    resize_origin: Mutex<Option<(i32, i32)>>,
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

#[tauri::command]
fn set_hit_rect(shared: State<Shared>, x: f64, y: f64, w: f64, h: f64) {
    if let Ok(mut hit) = shared.hit.lock() {
        *hit = Some(HitRect { x, y, w, h });
    }
}

/// Keeps the card itself on the screen under (cx, cy); the transparent margin
/// around it may go past the edges, so the card can reach the very top.
fn clamp_window(win: &WebviewWindow, x: i32, y: i32, cx: f64, cy: f64, card_w: f64) -> (i32, i32) {
    let s = win.scale_factor().unwrap_or(1.0);
    let monitors = win.available_monitors().unwrap_or_default();
    let on = |m: &&tauri::Monitor| {
        let (p, z) = (m.position(), m.size());
        cx >= p.x as f64 && cx < (p.x + z.width as i32) as f64 && cy >= p.y as f64 && cy < (p.y + z.height as i32) as f64
    };
    let Some(m) = monitors.iter().find(on).or(monitors.first()) else {
        return (x, y);
    };
    let (p, z) = (m.position(), m.size());
    let left = (STAGE_LEFT * s) as i32;
    let top = (STAGE_TOP * s) as i32;
    let card_w = (card_w * s) as i32;
    let keep = (KEEP_VISIBLE * s) as i32;
    let x = x.clamp(p.x - left, (p.x + z.width as i32 - left - card_w).max(p.x - left));
    let y = y.clamp(p.y - top, (p.y + z.height as i32 - top - keep).max(p.y - top));
    (x, y)
}

/// Our own window drag. Windows' built-in drag won't let a window's top edge
/// go above the screen, which would stop the card short of the top by the
/// glow margin. This follows the cursor until the page sends drag_end.
#[tauri::command]
fn drag_start(window: WebviewWindow, shared: State<Shared>) {
    let (Ok(cursor0), Ok(win0)) = (window.cursor_position(), window.outer_position()) else {
        return;
    };
    let dragging = shared.dragging.clone();
    let card_w = shared.card_w.clone();
    if dragging.swap(true, Ordering::SeqCst) {
        return; // already dragging
    }
    std::thread::spawn(move || {
        let started = std::time::Instant::now();
        let mut last = (win0.x, win0.y);
        // Safety net: never follow the cursor for more than a minute.
        while dragging.load(Ordering::SeqCst) && started.elapsed() < Duration::from_secs(60) {
            std::thread::sleep(Duration::from_millis(8));
            let Ok(c) = window.cursor_position() else { continue };
            let x = win0.x + (c.x - cursor0.x).round() as i32;
            let y = win0.y + (c.y - cursor0.y).round() as i32;
            let w = card_w.load(Ordering::SeqCst) as f64;
            let next = clamp_window(&window, x, y, c.x, c.y, w);
            if next != last {
                last = next;
                let _ = window.set_position(PhysicalPosition::new(next.0, next.1));
            }
        }
        dragging.store(false, Ordering::SeqCst);
    });
}

#[tauri::command]
fn drag_end(shared: State<Shared>) {
    shared.dragging.store(false, Ordering::SeqCst);
}

/// The user started dragging an edge of the overlay to resize it.
#[tauri::command]
fn resize_begin(window: WebviewWindow, shared: State<Shared>) {
    shared.dragging.store(true, Ordering::SeqCst); // keep the mouse meanwhile
    if let (Ok(p), Ok(mut origin)) = (window.outer_position(), shared.resize_origin.lock()) {
        *origin = Some((p.x, p.y));
    }
}

/// Size the window to fit an overlay `width` wide. When growing from the
/// left edge, move the window left by the same amount so the right edge stays.
#[tauri::command]
fn resize_to(window: WebviewWindow, shared: State<Shared>, width: f64, left: bool, start_width: f64, scale: Option<f64>) {
    // `width` is the overlay's on-screen width; a scaled-down overlay can be
    // narrower than CARD_W.
    let w = width.clamp(CARD_W * 0.7, MAX_CARD_W);
    shared.card_w.store(w as u32, Ordering::SeqCst);
    let dpi = window.scale_factor().unwrap_or(1.0);
    if left {
        if let Some((x0, y0)) = shared.resize_origin.lock().ok().and_then(|o| *o) {
            let x = x0 - ((w - start_width) * dpi).round() as i32;
            let _ = window.set_position(PhysicalPosition::new(x, y0));
        }
    }
    // A bigger overlay needs a taller window for the lyrics panel.
    let h = WINDOW_H * scale.unwrap_or(1.0).max(1.0);
    let _ = window.set_size(LogicalSize::new(w + 2.0 * STAGE_LEFT, h));
}

#[tauri::command]
fn resize_end(shared: State<Shared>) {
    shared.dragging.store(false, Ordering::SeqCst);
    if let Ok(mut origin) = shared.resize_origin.lock() {
        *origin = None;
    }
}

fn position_file(app: &tauri::AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join("position.txt"))
}

/// Last saved position, if it is still on one of the screens.
fn saved_position(win: &WebviewWindow) -> Option<PhysicalPosition<i32>> {
    let text = std::fs::read_to_string(position_file(win.app_handle())?).ok()?;
    let mut parts = text.split_whitespace().map(|p| p.parse::<i32>());
    let (x, y) = (parts.next()?.ok()?, parts.next()?.ok()?);
    // Valid if a point near the card's top-centre is on some screen (the
    // window itself may start above the screen; see clamp_window).
    let scale = win.scale_factor().unwrap_or(1.0);
    let cx = x as f64 + (STAGE_LEFT + CARD_W / 2.0) * scale;
    let cy = y as f64 + (STAGE_TOP + 20.0) * scale;
    let on_screen = win.available_monitors().ok()?.iter().any(|m| {
        let (p, s) = (m.position(), m.size());
        cx >= p.x as f64 && cx < (p.x + s.width as i32) as f64 && cy >= p.y as f64 && cy < (p.y + s.height as i32) as f64
    });
    on_screen.then(|| PhysicalPosition::new(x, y))
}

/// Default spot: top-right corner of the main screen.
fn default_position(win: &WebviewWindow) -> PhysicalPosition<i32> {
    let scale = win.scale_factor().unwrap_or(1.0);
    match win.primary_monitor() {
        Ok(Some(m)) => {
            let w = (WINDOW_W as f64 * scale) as i32;
            // card's top edge EDGE_GAP below the top of the screen
            let top = (STAGE_TOP * scale) as i32;
            PhysicalPosition::new(m.position().x + m.size().width as i32 - w - EDGE_GAP, m.position().y + EDGE_GAP - top)
        }
        _ => PhysicalPosition::new(200, 40),
    }
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

/// Lets clicks fall through everywhere except on the visible overlay, and
/// tells the page when the mouse is over it (to expand / collapse).
fn track_cursor(win: WebviewWindow, hit: Arc<Mutex<Option<HitRect>>>, dragging: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        let mut inside_before: Option<bool> = None;
        let mut last_xy = (f64::MIN, f64::MIN);
        loop {
            std::thread::sleep(Duration::from_millis(35));
            let (Ok(cursor), Ok(origin), Ok(scale)) = (win.cursor_position(), win.inner_position(), win.scale_factor())
            else {
                continue;
            };
            let rect = hit.lock().ok().and_then(|r| *r);
            // Mouse position in the page's coordinates (may be outside the window).
            let x = (cursor.x - origin.x as f64) / scale;
            let y = (cursor.y - origin.y as f64) / scale;
            // While dragging, the overlay keeps the mouse even if it lags behind.
            let inside = dragging.load(Ordering::SeqCst)
                || rect.is_some_and(|r| x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
            // The page uses this to show the title pill when the mouse comes near.
            if (x - last_xy.0).abs() > 1.0 || (y - last_xy.1).abs() > 1.0 {
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

fn main() {
    log(&format!("start: args={:?}", std::env::args().skip(1).collect::<Vec<_>>()));
    std::panic::set_hook(Box::new(|info| log(&format!("PANIC: {info}"))));
    let hit = Arc::new(Mutex::new(None));
    let dragging = Arc::new(AtomicBool::new(false));
    tauri::Builder::default()
        .manage(Shared {
            hit: hit.clone(),
            out: Mutex::new(std::io::stdout()),
            dragging: dragging.clone(),
            card_w: Arc::new(AtomicU32::new(CARD_W as u32)),
            resize_origin: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            send_action,
            set_hit_rect,
            drag_start,
            drag_end,
            resize_begin,
            resize_to,
            resize_end
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::Moved(pos) = event {
                if let Some(file) = position_file(window.app_handle()) {
                    let _ = std::fs::write(file, format!("{} {}", pos.x, pos.y));
                }
            }
        })
        .setup(move |app| {
            let win = app.get_webview_window("main").expect("main window");
            let pos = saved_position(&win).unwrap_or_else(|| default_position(&win));
            let _ = win.set_position(pos);
            let _ = win.set_ignore_cursor_events(true);
            let _ = win.show();
            pipe_stdin(app.handle().clone());
            track_cursor(win, hit.clone(), dragging.clone());
            log("window shown");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to start Sonavia");
}
