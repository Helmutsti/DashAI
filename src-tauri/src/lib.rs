mod config_dir;
mod os_integration;
mod pty;
mod stores;
mod windows;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .manage(pty::PtyState::default())
    .invoke_handler(tauri::generate_handler![
      pty::term_create,
      pty::term_input,
      pty::term_resize,
      pty::term_dispose,
      pty::term_attach,
      stores::projects_load,
      stores::projects_save,
      stores::projects_path,
      stores::projects_export,
      stores::projects_import,
      stores::settings_load,
      stores::settings_save,
      stores::settings_path,
      os_integration::dialog_pick_directory,
      os_integration::dialog_pick_file,
      os_integration::shell_open_path,
      windows::terminal_detach_open,
      windows::terminal_detach_close,
      windows::window_is_fullscreen,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      windows::wire_main_window(app.handle());
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while running tauri application")
    .run(|app_handle, event| {
      if let tauri::RunEvent::ExitRequested { .. } = event {
        pty::dispose_all(app_handle);
      }
    });
}
