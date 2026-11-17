// The desktop window renders the exact same view as the browser overlay:
// copy it from the extension before the UI gets embedded into the exe.
fn main() {
    let src = "../content/overlay-view.js";
    println!("cargo:rerun-if-changed={src}");
    std::fs::copy(src, "ui/overlay-view.js").expect("copy content/overlay-view.js into desktop/ui");
    tauri_build::build()
}
