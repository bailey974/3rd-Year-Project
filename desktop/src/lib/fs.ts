import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

export async function pickAndOpenFile() {
  const selected = await open({ multiple: false, filters: [{ name: "Text", extensions: ["txt","md","ts","js","json"] }] });
  if (!selected || Array.isArray(selected)) return { path: null, content: "" };
  const content = await readTextFile(selected);
  return { path: selected, content };
}

export async function pickAndSaveFile(content: string) {
  const target = await save({ filters: [{ name: "Text", extensions: ["txt","md","ts","js","json"] }] });
  if (!target) return null;
  await writeTextFile(target, content);
  return target;
}
