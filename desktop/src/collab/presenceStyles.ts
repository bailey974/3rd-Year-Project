import * as Y from "yjs";

export function getFilesMap(doc: Y.Doc) {
  return doc.getMap<Y.Text>("files");
}

export function getOrCreateYText(doc: Y.Doc, filePath: string) {
  const files = getFilesMap(doc);

  // Normalize paths so Windows/macOS users match
  const key = filePath.replaceAll("\\", "/");

  let ytext = files.get(key);
  if (!ytext) {
    ytext = new Y.Text();
    files.set(key, ytext);
  }
  return ytext;
}
