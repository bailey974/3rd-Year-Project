use std::{
  collections::HashMap,
  io::{Read, Write},
  sync::Mutex,
};

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

pub struct TerminalState(Mutex<HashMap<String, TermSession>>);

impl Default for TerminalState {
  fn default() -> Self {
    Self(Mutex::new(HashMap::new()))
  }
}

impl TerminalState {
  fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<String, TermSession>> {
    self.0.lock().expect("terminal state poisoned")
  }
}

struct TermSession {
  master: Box<dyn MasterPty + Send>,
  writer: Box<dyn Write + Send>,
  child: Box<dyn portable_pty::Child + Send>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalDataEvent {
  id: String,
  data: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalExitEvent {
  id: String,
}

fn default_shell_command() -> CommandBuilder {
  #[cfg(target_os = "windows")]
  {
    let mut cmd = CommandBuilder::new("powershell.exe");
    cmd.args(["-NoLogo"]);
    cmd
  }

  #[cfg(not(target_os = "windows"))]
  {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
    CommandBuilder::new(shell)
  }
}

#[tauri::command]
pub fn terminal_create(
  app: AppHandle,
  state: State<TerminalState>,
  cols: u16,
  rows: u16,
  cwd: Option<String>,
) -> Result<String, String> {
  let id = Uuid::new_v4().to_string();

  let pty_system = native_pty_system();
  let pair = pty_system
    .openpty(PtySize {
      rows,
      cols,
      pixel_width: 0,
      pixel_height: 0,
    })
    .map_err(|e| e.to_string())?;

  let mut cmd = default_shell_command();
  if let Some(dir) = cwd {
    cmd.cwd(dir);
  }

  let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

  let master = pair.master;
  let mut reader = master.try_clone_reader().map_err(|e| e.to_string())?;
  let writer = master.take_writer().map_err(|e| e.to_string())?;

  {
    // IMPORTANT: use the guard directly (no Ok(...))
    let mut map = state.lock();
    map.insert(
      id.clone(),
      TermSession {
        master,
        writer,
        child,
      },
    );
  }

  // Stream PTY output -> frontend via Tauri events
  let app_for_thread = app.clone();
  let id_for_thread = id.clone();
  std::thread::spawn(move || {
    let mut buf = [0u8; 8192];
    loop {
      match reader.read(&mut buf) {
        Ok(0) => break,
        Ok(n) => {
          let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
          let _ = app_for_thread.emit(
            "terminal:data",
            TerminalDataEvent {
              id: id_for_thread.clone(),
              data: chunk,
            },
          );
        }
        Err(_) => break,
      }
    }

    let _ = app_for_thread.emit("terminal:exit", TerminalExitEvent { id: id_for_thread });
  });

  Ok(id)
}

#[tauri::command]
pub fn terminal_write(state: State<TerminalState>, id: String, data: String) -> Result<(), String> {
  let mut map = state.lock();
  let session = map.get_mut(&id).ok_or("unknown terminal id")?;

  session
    .writer
    .write_all(data.as_bytes())
    .map_err(|e| e.to_string())?;
  session.writer.flush().ok();

  Ok(())
}

#[tauri::command]
pub fn terminal_resize(
  state: State<TerminalState>,
  id: String,
  cols: u16,
  rows: u16,
) -> Result<(), String> {
  let map = state.lock();
  let session = map.get(&id).ok_or("unknown terminal id")?;

  session
    .master
    .resize(PtySize {
      rows,
      cols,
      pixel_width: 0,
      pixel_height: 0,
    })
    .map_err(|e| e.to_string())?;

  Ok(())
}

#[tauri::command]
pub fn terminal_kill(state: State<TerminalState>, id: String) -> Result<(), String> {
  let mut map = state.lock();
  if let Some(mut session) = map.remove(&id) {
    let _ = session.child.kill();
  }
  Ok(())
}
