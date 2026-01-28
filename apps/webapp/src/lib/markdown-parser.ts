import type { DirectoryNode, UploadEntry } from "./directory-tree";
import { isValidFolderName } from "./folder-name";

export const isValidMarkdownFile = (file: File): boolean => {
  return file.name.toLowerCase().endsWith('.md');
};

export const toTitleCase = (name: string): string => {
  return name
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

export const slugify = (input: string): string => {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s-_]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
};

export const sanitizeFilename = (filename: string): string => {
  const name = filename.replace(/\.md$/i, '');
  if (isValidFolderName(name)) {
    return name;
  }
  return slugify(name);
};

export const parseDirectoryStructure = (files: File[]): DirectoryNode[] => {
  const root: DirectoryNode[] = [];
  const pathMap = new Map<string, DirectoryNode>();

  files.forEach((file) => {
    if (!isValidMarkdownFile(file)) {
      return;
    }

    const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const parts = relativePath.split('/').filter(Boolean);
    const fileName = parts.pop()!;

    let currentPath = '';
    let parent: DirectoryNode[] = root;

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      let node = pathMap.get(currentPath);
      if (!node) {
        node = {
          type: 'folder',
          name: part,
          path: currentPath,
          children: [],
        };
        pathMap.set(currentPath, node);
        parent.push(node);
      }

      parent = node.children!;
    }

    parent.push({
      type: 'file',
      name: fileName,
      path: currentPath ? `${currentPath}/${fileName}` : fileName,
      file,
    });
  });

  return root;
};

export type FileWithPath = {
  file: File;
  relativePath: string;
};

export const parseDirectoryStructureWithPath = (files: FileWithPath[]): DirectoryNode[] => {
  const root: DirectoryNode[] = [];
  const pathMap = new Map<string, DirectoryNode>();

  files.forEach(({ file, relativePath }) => {
    if (!isValidMarkdownFile(file)) {
      return;
    }

    const parts = relativePath.split('/').filter(Boolean);
    const fileName = parts.pop()!;

    let currentPath = '';
    let parent: DirectoryNode[] = root;

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      let node = pathMap.get(currentPath);
      if (!node) {
        node = {
          type: 'folder',
          name: part,
          path: currentPath,
          children: [],
        };
        pathMap.set(currentPath, node);
        parent.push(node);
      }

      parent = node.children!;
    }

    parent.push({
      type: 'file',
      name: fileName,
      path: currentPath ? `${currentPath}/${fileName}` : fileName,
      file,
    });
  });

  return root;
};

export const flattenDirectoryTree = (nodes: DirectoryNode[], targetPath: string | null = null): UploadEntry[] => {
  const entries: UploadEntry[] = [];

  const traverse = (currentNodes: DirectoryNode[], currentBasePath: string | null) => {
    currentNodes.forEach((node) => {
      if (node.type === 'folder' && node.children) {
        const folderPath = currentBasePath ? `${currentBasePath}/${node.name}` : node.name;
        traverse(node.children, folderPath);
      } else if (node.type === 'file' && node.file) {
        const fileName = node.file.name;
        const name = sanitizeFilename(fileName);
        const title = toTitleCase(name);

        entries.push({
          name,
          title,
          content: '', // Will be filled during upload
          folderPath: currentBasePath,
          file: node.file,
        });
      }
    });
  };

  traverse(nodes, targetPath);
  return entries;
};
