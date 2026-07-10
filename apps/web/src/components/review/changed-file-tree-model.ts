import type { ChangedFile } from "./changed-file-summary";

export interface ChangedFileDirectoryNode {
  name: string;
  path: string;
  directories: ChangedFileDirectoryNode[];
  files: ChangedFile[];
}

export interface ChangedFileTreeModel {
  directories: ChangedFileDirectoryNode[];
  files: ChangedFile[];
}

interface MutableDirectoryNode {
  name: string;
  path: string;
  directories: Map<string, MutableDirectoryNode>;
  files: ChangedFile[];
}

export function buildChangedFileTree(files: ChangedFile[]): ChangedFileTreeModel {
  const root: MutableDirectoryNode = {
    name: "",
    path: "",
    directories: new Map(),
    files: [],
  };

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    parts.pop();

    let directory = root;
    for (const part of parts) {
      const path = directory.path ? `${directory.path}/${part}` : part;
      let child = directory.directories.get(part);
      if (!child) {
        child = { name: part, path, directories: new Map(), files: [] };
        directory.directories.set(part, child);
      }
      directory = child;
    }
    directory.files.push(file);
  }

  return toTreeModel(root);
}

function toTreeModel(directory: MutableDirectoryNode): ChangedFileTreeModel {
  return {
    directories: [...directory.directories.values()]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((child) => ({ name: child.name, path: child.path, ...toTreeModel(child) })),
    files: [...directory.files].sort((left, right) => left.path.localeCompare(right.path)),
  };
}
