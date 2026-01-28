export type DirectoryNode = {
  type: 'file' | 'folder';
  name: string;
  path: string;
  children?: DirectoryNode[];
  file?: File;
};

export type UploadEntry = {
  name: string;
  title: string;
  content: string;
  folderPath: string | null;
  file: File;
};
