use serde::{Deserialize, Serialize};
use std::{
  collections::HashMap,
  fs,
  path::{Path, PathBuf},
  sync::{Arc, Mutex},
};
use tauri::{
  menu::{AboutMetadata, MenuBuilder, MenuItemBuilder, SubmenuBuilder},
  AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_opener::OpenerExt;

const MENU_EVENT: &str = "tdx://menu-command";
const MAX_RECENT_FILES: usize = 10;
const PROJECT_URL: &str = "https://github.com/sjjliqpl/tdx-editor";

#[derive(Default)]
struct AppState {
  paths_by_label: Mutex<HashMap<String, PathBuf>>,
  labels_by_path: Mutex<HashMap<PathBuf, String>>,
  dirty_by_label: Mutex<HashMap<String, bool>>,
  recent_files: Mutex<Vec<PathBuf>>,
  active_label: Mutex<Option<String>>,
  startup_placeholder_label: Mutex<Option<String>>,
}

#[derive(Clone, Serialize)]
struct TdxFile {
  file_path: Option<String>,
  file_name: String,
  draft_key: Option<String>,
  content: String,
  dirty: bool,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DraftPayload {
  id: String,
  file_name: String,
  file_path: Option<String>,
  draft_key: Option<String>,
  content: String,
  dirty: bool,
}

fn file_name(path: &Path) -> String {
  path
    .file_name()
    .and_then(|name| name.to_str())
    .unwrap_or("Untitled.tdx")
    .to_string()
}

fn canonical_or_original(path: &Path) -> PathBuf {
  path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

fn draft_dir(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|error| error.to_string())?
    .join("drafts");
  fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
  Ok(dir)
}

fn recent_files_path(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
  fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
  Ok(dir.join("recent-files.json"))
}

fn load_recent_files(app: &AppHandle) {
  let Some(path) = recent_files_path(app).ok() else {
    return;
  };
  let Some(content) = fs::read_to_string(path).ok() else {
    return;
  };
  let Ok(paths) = serde_json::from_str::<Vec<String>>(&content) else {
    return;
  };
  let state = app.state::<Arc<AppState>>();
  *state
    .recent_files
    .lock()
    .expect("recent_files mutex poisoned") = paths.into_iter().map(PathBuf::from).collect();
}

fn persist_recent_files(app: &AppHandle) -> Result<(), String> {
  let state = app.state::<Arc<AppState>>();
  let paths: Vec<String> = state
    .recent_files
    .lock()
    .expect("recent_files mutex poisoned")
    .iter()
    .map(|path| path.to_string_lossy().to_string())
    .collect();
  let content = serde_json::to_string_pretty(&paths).map_err(|error| error.to_string())?;
  fs::write(recent_files_path(app)?, content).map_err(|error| error.to_string())
}

fn remember_recent_file(app: &AppHandle, path: &Path) -> Result<(), String> {
  let normalized = canonical_or_original(path);
  {
    let state = app.state::<Arc<AppState>>();
    let mut recent = state
      .recent_files
      .lock()
      .expect("recent_files mutex poisoned");
    recent.retain(|existing| existing != &normalized);
    recent.insert(0, normalized);
    recent.truncate(MAX_RECENT_FILES);
  }
  persist_recent_files(app)?;
  let _ = create_menu(app);
  Ok(())
}

fn clear_recent_files(app: &AppHandle) -> Result<(), String> {
  app
    .state::<Arc<AppState>>()
    .recent_files
    .lock()
    .expect("recent_files mutex poisoned")
    .clear();
  persist_recent_files(app)?;
  let _ = create_menu(app);
  Ok(())
}

fn draft_name_for_key(key: &str) -> String {
  let mut hash = 0xcbf29ce484222325u64;
  for byte in key.as_bytes() {
    hash ^= u64::from(*byte);
    hash = hash.wrapping_mul(0x100000001b3);
  }
  format!("{hash:x}.json")
}

fn draft_path(app: &AppHandle, key: &str) -> Result<PathBuf, String> {
  Ok(draft_dir(app)?.join(draft_name_for_key(key)))
}

fn read_draft_for_key(app: &AppHandle, key: &str) -> Option<DraftPayload> {
  let path = draft_path(app, key).ok()?;
  let content = fs::read_to_string(path).ok()?;
  serde_json::from_str(&content).ok()
}

fn read_latest_untitled_draft(app: &AppHandle) -> Option<DraftPayload> {
  let dir = draft_dir(app).ok()?;
  let entries = fs::read_dir(dir).ok()?;
  let mut latest: Option<(std::time::SystemTime, DraftPayload)> = None;

  for entry in entries.flatten() {
    let Ok(metadata) = entry.metadata() else {
      continue;
    };
    let Ok(modified) = metadata.modified() else {
      continue;
    };
    let Ok(content) = fs::read_to_string(entry.path()) else {
      continue;
    };
    let Ok(draft) = serde_json::from_str::<DraftPayload>(&content) else {
      continue;
    };
    if draft.file_path.is_some() || !draft.dirty {
      continue;
    }
    if latest.as_ref().is_none_or(|(current, _)| modified > *current) {
      latest = Some((modified, draft));
    }
  }

  latest.map(|(_, draft)| draft)
}

fn draft_to_tdx_file(draft: DraftPayload) -> TdxFile {
  let draft_key = draft
    .draft_key
    .clone()
    .or_else(|| draft.file_path.clone())
    .unwrap_or_else(|| draft.id.clone());

  TdxFile {
    file_path: draft.file_path,
    file_name: draft.file_name,
    draft_key: Some(draft_key),
    content: draft.content,
    dirty: draft.dirty,
  }
}

fn read_file(path: &Path) -> Result<TdxFile, String> {
  let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
  let normalized = canonical_or_original(path);

  Ok(TdxFile {
    file_path: Some(normalized.to_string_lossy().to_string()),
    file_name: file_name(&normalized),
    draft_key: None,
    content,
    dirty: false,
  })
}

fn window_label_for_path(path: Option<&Path>) -> String {
  match path {
    Some(path) => {
      let stable = canonical_or_original(path).to_string_lossy().to_string();
      let mut hash = 0xcbf29ce484222325u64;
      for byte in stable.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
      }
      format!("doc-{hash:x}")
    }
    None => format!(
      "untitled-{}",
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
    ),
  }
}

fn register_window_path(app: &AppHandle, label: &str, path: Option<&Path>) {
  let Some(path) = path else {
    return;
  };
  let state = app.state::<Arc<AppState>>();
  let normalized = canonical_or_original(path);

  let previous = state
    .paths_by_label
    .lock()
    .expect("paths_by_label mutex poisoned")
    .insert(label.to_string(), normalized.clone());
  if let Some(previous) = previous {
    state
      .labels_by_path
      .lock()
      .expect("labels_by_path mutex poisoned")
      .remove(&previous);
  }
  state
    .labels_by_path
    .lock()
    .expect("labels_by_path mutex poisoned")
    .insert(normalized, label.to_string());
}

fn unregister_window(app: &AppHandle, label: &str) {
  let state = app.state::<Arc<AppState>>();
  let previous = state
    .paths_by_label
    .lock()
    .expect("paths_by_label mutex poisoned")
    .remove(label);
  if let Some(previous) = previous {
    state
      .labels_by_path
      .lock()
      .expect("labels_by_path mutex poisoned")
      .remove(&previous);
  }
  state
    .dirty_by_label
    .lock()
    .expect("dirty_by_label mutex poisoned")
    .remove(label);

  let mut startup_placeholder_label = state
    .startup_placeholder_label
    .lock()
    .expect("startup_placeholder_label mutex poisoned");
  if startup_placeholder_label.as_deref() == Some(label) {
    *startup_placeholder_label = None;
  }
}

fn set_startup_placeholder(app: &AppHandle, label: &str) {
  *app
    .state::<Arc<AppState>>()
    .startup_placeholder_label
    .lock()
    .expect("startup_placeholder_label mutex poisoned") = Some(label.to_string());
}

fn startup_placeholder_for_assignment(app: &AppHandle) -> Option<String> {
  let state = app.state::<Arc<AppState>>();
  let label = state
    .startup_placeholder_label
    .lock()
    .expect("startup_placeholder_label mutex poisoned")
    .clone()?;

  app.get_webview_window(&label)?;

  let main_has_path = state
    .paths_by_label
    .lock()
    .expect("paths_by_label mutex poisoned")
    .contains_key(&label);
  if main_has_path {
    return None;
  }

  let main_is_dirty = state
    .dirty_by_label
    .lock()
    .expect("dirty_by_label mutex poisoned")
    .get(&label)
    .copied()
    .unwrap_or(false);
  if main_is_dirty {
    return None;
  }

  Some(label)
}

fn close_clean_startup_placeholder(app: &AppHandle) {
  let Some(label) = startup_placeholder_for_assignment(app) else {
    return;
  };

  if let Some(window) = app.get_webview_window(&label) {
    let _ = window.destroy();
  }
}

fn close_clean_startup_placeholder_if_file_window_exists(app: &AppHandle) {
  let Some(label) = startup_placeholder_for_assignment(app) else {
    return;
  };

  let has_file_window = {
    let state = app.state::<Arc<AppState>>();
    let has_file_window = state
      .paths_by_label
      .lock()
      .expect("paths_by_label mutex poisoned")
      .keys()
      .any(|existing_label| existing_label != &label);
    has_file_window
  };
  if !has_file_window || read_latest_untitled_draft(app).is_some() {
    return;
  }

  if let Some(window) = app.get_webview_window(&label) {
    let _ = window.destroy();
  }
}

fn assign_window_path(app: &AppHandle, label: &str, path: &Path) {
  register_window_path(app, label, Some(path));
  {
    let state = app.state::<Arc<AppState>>();
    let mut startup_placeholder_label = state
      .startup_placeholder_label
      .lock()
      .expect("startup_placeholder_label mutex poisoned");
    if startup_placeholder_label.as_deref() == Some(label) {
      *startup_placeholder_label = None;
    }
  }
  let normalized = canonical_or_original(path);
  let title = format!("{} - TDX Editor", file_name(&normalized));
  if let Some(window) = app.get_webview_window(label) {
    let _ = window.set_title(&title);
    activate_window(app, &window);
    let _ = window.emit(
      "tdx://open-path",
      serde_json::json!({ "path": normalized.to_string_lossy().to_string() }),
    );
  }
  let _ = remember_recent_file(app, &normalized);
}

fn activate_window(app: &AppHandle, window: &WebviewWindow) {
  *app
    .state::<Arc<AppState>>()
    .active_label
    .lock()
    .expect("active_label mutex poisoned") = Some(window.label().to_string());

  #[cfg(target_os = "macos")]
  {
    let _ = app.show();
  }
  let _ = window.unminimize();
  let _ = window.show();
  let _ = window.set_focus();
}

fn emit_menu_command(app: &AppHandle, command: &str) {
  let windows = app.webview_windows();
  if windows.len() == 1 {
    if let Some(window) = windows.values().next() {
      let _ = window.emit(MENU_EVENT, command);
    }
    return;
  }

  for window in windows.values() {
    let _ = window.emit(MENU_EVENT, command);
  }
}

fn create_menu(app: &AppHandle) -> tauri::Result<()> {
  let recent_files = app
    .state::<Arc<AppState>>()
    .recent_files
    .lock()
    .expect("recent_files mutex poisoned")
    .clone();
  let mut recent_menu = SubmenuBuilder::new(app, "Open Recent");
  if recent_files.is_empty() {
    recent_menu = recent_menu.item(
      &MenuItemBuilder::with_id("recent_empty", "No Recent Files")
        .enabled(false)
        .build(app)?,
    );
  } else {
    for (index, path) in recent_files.iter().enumerate() {
      recent_menu = recent_menu.item(
        &MenuItemBuilder::with_id(format!("recent_{index}"), file_name(path)).build(app)?,
      );
    }
    recent_menu = recent_menu
      .separator()
      .item(&MenuItemBuilder::with_id("recent_clear", "Clear Recent Files").build(app)?);
  }
  let recent_menu = recent_menu.build()?;

  let app_menu = SubmenuBuilder::new(app, "TDX Editor")
    .about(Some(AboutMetadata {
      name: Some("TDX Editor".into()),
      version: Some(env!("CARGO_PKG_VERSION").into()),
      comments: Some("通达信 .tdx 公式编辑器".into()),
      ..Default::default()
    }))
    .separator()
    .services()
    .separator()
    .hide()
    .hide_others()
    .show_all()
    .separator()
    .quit()
    .build()?;

  let file = SubmenuBuilder::new(app, "File")
    .item(
      &MenuItemBuilder::with_id("new", "New")
        .accelerator("CmdOrCtrl+N")
        .build(app)?,
    )
    .item(
      &MenuItemBuilder::with_id("open", "Open...")
        .accelerator("CmdOrCtrl+O")
        .build(app)?,
    )
    .item(&recent_menu)
    .separator()
    .item(
      &MenuItemBuilder::with_id("save", "Save")
        .accelerator("CmdOrCtrl+S")
        .build(app)?,
    )
    .item(
      &MenuItemBuilder::with_id("saveAs", "Save As...")
        .accelerator("CmdOrCtrl+Shift+S")
        .build(app)?,
    )
    .separator()
    .item(
      &MenuItemBuilder::with_id("close", "Close Window")
        .accelerator("CmdOrCtrl+W")
        .build(app)?,
    )
    .build()?;

  let edit = SubmenuBuilder::new(app, "Edit")
    .undo()
    .redo()
    .separator()
    .cut()
    .copy()
    .paste()
    .select_all()
    .build()?;

  let view = SubmenuBuilder::new(app, "View")
    .item(
      &MenuItemBuilder::with_id("toggleProblems", "Toggle Problems")
        .accelerator("CmdOrCtrl+Shift+M")
        .build(app)?,
    )
    .item(
      &MenuItemBuilder::with_id("toggleTheme", "Toggle Theme")
        .accelerator("CmdOrCtrl+Shift+T")
        .build(app)?,
    )
    .separator()
    .item(&MenuItemBuilder::with_id("loadSample", "Load Sample Formula").build(app)?)
    .build()?;

  let window = SubmenuBuilder::new(app, "Window")
    .minimize()
    .maximize()
    .separator()
    .bring_all_to_front()
    .build()?;

  let help = SubmenuBuilder::new(app, "Help")
    .item(&MenuItemBuilder::with_id("projectLink", "Project on GitHub").build(app)?)
    .build()?;

  let menu = MenuBuilder::new(app)
    .item(&app_menu)
    .item(&file)
    .item(&edit)
    .item(&view)
    .item(&window)
    .item(&help)
    .build()?;

  app.set_menu(menu)?;

  Ok(())
}

fn create_document_window(
  app: &AppHandle,
  path: Option<PathBuf>,
  content: Option<String>,
) -> Result<WebviewWindow, String> {
  if let Some(path) = path.as_deref() {
    let normalized = canonical_or_original(path);
    if let Some(label) = app
      .state::<Arc<AppState>>()
      .labels_by_path
      .lock()
      .expect("labels_by_path mutex poisoned")
      .get(&normalized)
      .cloned()
    {
      if let Some(existing) = app.get_webview_window(&label) {
        activate_window(app, &existing);
        return Ok(existing);
      }
    }
  }

  let label = window_label_for_path(path.as_deref());
  let title = path
    .as_deref()
    .map(file_name)
    .unwrap_or_else(|| "Untitled.tdx".to_string());
  let initial_path = path
    .as_deref()
    .map(|path| canonical_or_original(path).to_string_lossy().to_string());
  let escaped_path = serde_json::to_string(&initial_path).map_err(|error| error.to_string())?;
  let restored_content = path.as_deref().and_then(|path| {
    let key = canonical_or_original(path).to_string_lossy().to_string();
    read_draft_for_key(app, &key)
      .filter(|draft| draft.dirty)
      .map(|draft| draft.content)
  });
  let initial_content = content.or(restored_content);
  let escaped_content = serde_json::to_string(&initial_content).map_err(|error| error.to_string())?;
  let init_script = format!(
    "window.__TDX_INITIAL_PATH__ = {escaped_path}; window.__TDX_INITIAL_CONTENT__ = {escaped_content};"
  );

  let window = WebviewWindowBuilder::new(app, label.clone(), WebviewUrl::default())
    .title(format!("{title} - TDX Editor"))
    .inner_size(1100.0, 760.0)
    .min_inner_size(760.0, 520.0)
    .initialization_script(init_script)
    .build()
    .map_err(|error| error.to_string())?;

  app
    .state::<Arc<AppState>>()
    .dirty_by_label
    .lock()
    .expect("dirty_by_label mutex poisoned")
    .insert(label.clone(), false);
  register_window_path(app, &label, path.as_deref());
  if let Some(path) = path.as_deref() {
    let _ = remember_recent_file(app, path);
    close_clean_startup_placeholder(app);
  }
  activate_window(app, &window);
  Ok(window)
}

fn open_paths(
  app: &AppHandle,
  paths: impl IntoIterator<Item = PathBuf>,
  assign_first_to_main: bool,
) -> usize {
  let mut opened = 0;
  for path in paths {
    if path.exists() {
      if assign_first_to_main
        && opened == 0
      {
        if let Some(label) = startup_placeholder_for_assignment(app) {
          assign_window_path(app, &label, &path);
        } else {
          let _ = create_document_window(app, Some(path), None);
        }
      } else {
        let _ = create_document_window(app, Some(path), None);
      }
      opened += 1;
    }
  }
  opened
}

#[tauri::command]
fn read_tdx_file(app: AppHandle, path: String) -> Result<TdxFile, String> {
  let path = PathBuf::from(path);
  let file = read_file(&path)?;
  let _ = remember_recent_file(&app, &path);
  Ok(file)
}

#[tauri::command]
fn write_tdx_file(app: AppHandle, path: String, content: String) -> Result<(), String> {
  let path = PathBuf::from(path);
  fs::write(&path, content).map_err(|error| error.to_string())?;
  let _ = remember_recent_file(&app, &path);
  Ok(())
}

#[tauri::command]
fn set_current_document_path(
  window: WebviewWindow,
  app: AppHandle,
  path: String,
) -> Result<(), String> {
  let path = PathBuf::from(path);
  register_window_path(&app, window.label(), Some(&path));
  let _ = remember_recent_file(&app, &path);
  Ok(())
}

#[tauri::command]
fn set_window_document_dirty(
  window: WebviewWindow,
  app: AppHandle,
  dirty: bool,
) -> Result<(), String> {
  app
    .state::<Arc<AppState>>()
    .dirty_by_label
    .lock()
    .expect("dirty_by_label mutex poisoned")
    .insert(window.label().to_string(), dirty);
  Ok(())
}

#[tauri::command]
fn write_draft(app: AppHandle, draft: DraftPayload) -> Result<(), String> {
  if !draft.dirty {
    return clear_draft(app, draft.draft_key.or(draft.file_path));
  }

  let key = draft
    .draft_key
    .clone()
    .or_else(|| draft.file_path.clone())
    .unwrap_or_else(|| draft.id.clone());
  let path = draft_path(&app, &key)?;
  let content = serde_json::to_string_pretty(&draft).map_err(|error| error.to_string())?;
  fs::write(path, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn clear_draft(app: AppHandle, draft_key: Option<String>) -> Result<(), String> {
  let Some(key) = draft_key else {
    return Ok(());
  };
  let path = draft_path(&app, &key)?;
  if path.exists() {
    fs::remove_file(path).map_err(|error| error.to_string())?;
  }
  Ok(())
}

#[tauri::command]
fn new_document_window(
  app: AppHandle,
  path: Option<String>,
  content: Option<String>,
) -> Result<(), String> {
  let path = path.map(PathBuf::from);
  create_document_window(&app, path, content).map(|_| ())
}

#[tauri::command]
fn get_initial_document(window: WebviewWindow, app: AppHandle) -> Result<Option<TdxFile>, String> {
  let label = window.label().to_string();
  let path = app
    .state::<Arc<AppState>>()
    .paths_by_label
    .lock()
    .expect("paths_by_label mutex poisoned")
    .get(&label)
    .cloned();

  match path {
    Some(path) => {
      let key = canonical_or_original(&path).to_string_lossy().to_string();
      if let Some(draft) = read_draft_for_key(&app, &key).filter(|draft| draft.dirty) {
        return Ok(Some(draft_to_tdx_file(draft)));
      }
      read_file(&path).map(Some)
    }
    None => Ok(read_latest_untitled_draft(&app).map(draft_to_tdx_file)),
  }
}

#[tauri::command]
fn get_assigned_document(window: WebviewWindow, app: AppHandle) -> Result<Option<TdxFile>, String> {
  get_initial_document(window, app)
}

pub fn run() {
  tauri::Builder::default()
    .manage(Arc::new(AppState::default()))
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
      open_paths(app, argv.into_iter().skip(1).map(PathBuf::from), true);
    }))
    .invoke_handler(tauri::generate_handler![
      read_tdx_file,
      write_tdx_file,
      set_current_document_path,
      set_window_document_dirty,
      write_draft,
      clear_draft,
      new_document_window,
      get_initial_document,
      get_assigned_document
    ])
    .setup(|app| {
      #[cfg(target_os = "macos")]
      app.set_activation_policy(tauri::ActivationPolicy::Regular);

      if let Some(main) = app.get_webview_window("main") {
        set_startup_placeholder(app.handle(), main.label());
        activate_window(app.handle(), &main);
        close_clean_startup_placeholder_if_file_window_exists(app.handle());
      }
      load_recent_files(app.handle());
      create_menu(app.handle())?;

      let opened = open_paths(
        app.handle(),
        std::env::args().skip(1).map(PathBuf::from),
        true,
      );
      close_clean_startup_placeholder_if_file_window_exists(app.handle());
      if opened == 0 && app.get_webview_window("main").is_none() {
        let window = create_document_window(app.handle(), None, None)?;
        set_startup_placeholder(app.handle(), window.label());
      }

      Ok(())
    })
    .on_menu_event(|app, event| {
      let id = event.id().0.as_str();
      match id {
        "new" => {
          let _ = create_document_window(app, None, None);
        }
        "open" | "save" | "saveAs" | "close" | "toggleProblems" | "toggleTheme" | "loadSample" => {
          emit_menu_command(app, id);
        }
        "recent_clear" => {
          let _ = clear_recent_files(app);
        }
        "projectLink" => {
          let _ = app.opener().open_url(PROJECT_URL, None::<&str>);
        }
        id if id.starts_with("recent_") => {
          let index = id
            .strip_prefix("recent_")
            .and_then(|value| value.parse::<usize>().ok());
          if let Some(index) = index {
            let path = app
              .state::<Arc<AppState>>()
              .recent_files
              .lock()
              .expect("recent_files mutex poisoned")
              .get(index)
              .cloned();
            if let Some(path) = path {
              let _ = create_document_window(app, Some(path), None);
            }
          }
        }
        _ => {}
      }
    })
    .build(tauri::generate_context!())
    .expect("error while building TDX Editor")
    .run(|app, event| {
      #[cfg(target_os = "macos")]
      {
        if let tauri::RunEvent::Opened { urls } = &event {
          open_paths(app, urls.iter().filter_map(|url| url.to_file_path().ok()), true);
        }
      }

      if let tauri::RunEvent::WindowEvent { label, event, .. } = event {
        match event {
          WindowEvent::Focused(true) => {
            *app
              .state::<Arc<AppState>>()
              .active_label
              .lock()
              .expect("active_label mutex poisoned") = Some(label.to_string());
          }
          WindowEvent::Destroyed => {
            unregister_window(app, &label);

            {
              let state = app.state::<Arc<AppState>>();
              let mut active_label = state
                .active_label
                .lock()
                .expect("active_label mutex poisoned");
              if active_label.as_deref() == Some(label.as_str()) {
                *active_label = None;
              }
            }

            if app.webview_windows().is_empty() {
              app.exit(0);
            }
          }
          _ => {}
        }
      }
    });
}
