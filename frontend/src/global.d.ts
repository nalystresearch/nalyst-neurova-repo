declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: "read" | "readwrite";
      startIn?: "desktop" | "documents" | "downloads" | "pictures";
    }) => Promise<FileSystemDirectoryHandle>;
  }

  interface Navigator {
    storage?: {
      persist?: () => Promise<boolean>;
      persisted?: () => Promise<boolean>;
    };
  }
}

export {};
