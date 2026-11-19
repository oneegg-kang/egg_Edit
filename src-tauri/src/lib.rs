// egg_Edit PC 앱 (Windows, Mac, Linux)
// 화면은 웹 앱과 똑같은 것을 쓰고, PC 에서만 필요한 기능(파일 저장 창, 바깥 링크 열기)만 더한다.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("egg_Edit 를 시작하지 못했습니다");
}
