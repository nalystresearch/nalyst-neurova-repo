import JSZip from "jszip";
import { openDb, requestToPromise, withStore, withStores } from "./storage/idb";

const DB_NAME = "bbox-studio";
const DB_VERSION = 1;

const STORE_PROJECTS = "projects";
const STORE_IMAGES = "images";
const STORE_ANNOTATIONS = "annotations";

export interface Project {
  id: number;
  name: string;
  description: string | null;
  classes: string;
  created_at: string;
  updated_at: string;
}

export interface Image {
  id: number;
  project_id: number;
  filename: string;
  file_path: string;
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface Annotation {
  id: number;
  image_id: number;
  class_id: number;
  x_center: number;
  y_center: number;
  width: number;
  height: number;
  created_at: string;
  updated_at: string;
}

type ApiResponse<T> = { data: T };

type ProjectRecord = Project & {
  root_handle?: FileSystemDirectoryHandle | null;
};

type ImageRecord = Image & {
  blob?: Blob;
  file_handle?: FileSystemFileHandle;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function nowIso(): string {
  return new Date().toISOString();
}

async function getDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openDb(DB_NAME, DB_VERSION, (db) => {
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, {
          keyPath: "id",
          autoIncrement: true,
        });
      }

      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        const store = db.createObjectStore(STORE_IMAGES, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("project_id", "project_id", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_ANNOTATIONS)) {
        const store = db.createObjectStore(STORE_ANNOTATIONS, {
          keyPath: "id",
          autoIncrement: true,
        });
        store.createIndex("image_id", "image_id", { unique: false });
      }
    });
  }
  return dbPromise;
}

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const persisted = (await navigator.storage?.persisted?.()) ?? false;
    if (persisted) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

function normalizeClassesString(value: string): string {
  return value
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .join(",");
}

// Projects
export async function getProjects(): Promise<ApiResponse<Project[]>> {
  const db = await getDb();
  const items = await withStore(db, STORE_PROJECTS, "readonly", (store) =>
    requestToPromise(store.getAll() as IDBRequest<ProjectRecord[]>),
  );
  const projects = items
    .map((p) => {
      // Strip non-serializable handle from UI shape
      const { root_handle: _root, ...rest } = p;
      return rest;
    })
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  return { data: projects };
}

export async function getProject(id: number): Promise<ApiResponse<Project>> {
  const db = await getDb();
  const item = await withStore(db, STORE_PROJECTS, "readonly", (store) =>
    requestToPromise(store.get(id) as IDBRequest<ProjectRecord | undefined>),
  );
  if (!item) throw new Error("Project not found");
  const { root_handle: _root, ...rest } = item;
  return { data: rest };
}

export async function createProject(data: {
  name: string;
  description?: string;
  classes: string;
}): Promise<ApiResponse<Project>> {
  const db = await getDb();
  const createdAt = nowIso();
  const record: Omit<ProjectRecord, "id"> = {
    name: data.name,
    description: data.description ?? null,
    classes: normalizeClassesString(data.classes),
    created_at: createdAt,
    updated_at: createdAt,
    root_handle: null,
  };

  const id = await withStore(db, STORE_PROJECTS, "readwrite", async (store) => {
    const key = await requestToPromise(
      store.add(record) as IDBRequest<IDBValidKey>,
    );
    return Number(key);
  });

  return {
    data: {
      id,
      name: record.name,
      description: record.description,
      classes: record.classes,
      created_at: record.created_at,
      updated_at: record.updated_at,
    },
  };
}

export async function updateProject(
  id: number,
  data: { name?: string; description?: string | null; classes?: string },
): Promise<ApiResponse<Project>> {
  const db = await getDb();
  const updated = await withStore(
    db,
    STORE_PROJECTS,
    "readwrite",
    async (store) => {
      const existing = await requestToPromise(
        store.get(id) as IDBRequest<ProjectRecord | undefined>,
      );
      if (!existing) throw new Error("Project not found");

      const next: ProjectRecord = {
        ...existing,
        name: data.name ?? existing.name,
        description:
          data.description === undefined
            ? existing.description
            : data.description,
        classes:
          data.classes === undefined
            ? existing.classes
            : normalizeClassesString(data.classes),
        updated_at: nowIso(),
      };
      await requestToPromise(store.put(next) as IDBRequest<IDBValidKey>);
      const { root_handle: _root, ...rest } = next;
      return rest;
    },
  );

  return { data: updated };
}

export async function deleteProject(
  id: number,
): Promise<ApiResponse<{ ok: true }>> {
  const db = await getDb();

  await withStores(
    db,
    [STORE_PROJECTS, STORE_IMAGES, STORE_ANNOTATIONS],
    "readwrite",
    async (stores) => {
      const projectStore = stores[STORE_PROJECTS];
      const imageStore = stores[STORE_IMAGES];
      const annStore = stores[STORE_ANNOTATIONS];

      await requestToPromise(projectStore.delete(id) as IDBRequest<unknown>);

      // Cascade delete images + annotations
      const imageIndex = imageStore.index("project_id");
      const images = await requestToPromise(
        imageIndex.getAll(IDBKeyRange.only(id)) as IDBRequest<ImageRecord[]>,
      );
      for (const img of images) {
        await requestToPromise(
          imageStore.delete(img.id) as IDBRequest<unknown>,
        );
        const annIndex = annStore.index("image_id");
        const anns = await requestToPromise(
          annIndex.getAll(IDBKeyRange.only(img.id)) as IDBRequest<Annotation[]>,
        );
        for (const ann of anns) {
          await requestToPromise(
            annStore.delete(ann.id) as IDBRequest<unknown>,
          );
        }
      }
    },
  );

  return { data: { ok: true } };
}

// Images
function isImageFilename(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".gif") ||
    lower.endsWith(".bmp") ||
    lower.endsWith(".avif")
  );
}

export async function getImages(
  projectId: number,
): Promise<ApiResponse<Image[]>> {
  const db = await getDb();
  const items = await withStore(db, STORE_IMAGES, "readonly", (store) => {
    const idx = store.index("project_id");
    return requestToPromise(
      idx.getAll(IDBKeyRange.only(projectId)) as IDBRequest<ImageRecord[]>,
    );
  });
  const images: Image[] = items
    .map((im) => ({
      id: im.id,
      project_id: im.project_id,
      filename: im.filename,
      file_path: im.file_path,
      width: im.width ?? null,
      height: im.height ?? null,
      created_at: im.created_at,
    }))
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  return { data: images };
}

export async function uploadImages(
  projectId: number,
  files: File[],
): Promise<ApiResponse<Image[]>> {
  const db = await getDb();
  const createdAt = nowIso();

  const inserted = await withStore(
    db,
    STORE_IMAGES,
    "readwrite",
    async (store) => {
      const out: Image[] = [];
      for (const file of files) {
        if (!file.name || !isImageFilename(file.name)) continue;
        const record: Omit<ImageRecord, "id"> = {
          project_id: projectId,
          filename: file.name,
          file_path: file.name,
          width: null,
          height: null,
          created_at: createdAt,
          blob: file,
        };
        const key = await requestToPromise(
          store.add(record) as IDBRequest<IDBValidKey>,
        );
        out.push({
          id: Number(key),
          project_id: projectId,
          filename: record.filename,
          file_path: record.file_path,
          width: null,
          height: null,
          created_at: createdAt,
        });
      }
      return out;
    },
  );

  return { data: inserted };
}

async function* walkDir(
  dir: FileSystemDirectoryHandle,
  prefix = "",
): AsyncGenerator<{ path: string; handle: FileSystemFileHandle }, void, void> {
  // `entries()` typing varies between TS versions; cast to any to keep build stable.
  const entries = (
    dir as unknown as { entries: () => AsyncIterable<[string, any]> }
  ).entries();
  for await (const [name, handle] of entries) {
    const nextPath = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "file") {
      if (isImageFilename(name)) {
        yield { path: nextPath, handle: handle as FileSystemFileHandle };
      }
    } else if (handle.kind === "directory") {
      yield* walkDir(handle as FileSystemDirectoryHandle, nextPath);
    }
  }
}

export async function importImagesFromFolder(
  projectId: number,
): Promise<ApiResponse<{ imported: number }>> {
  const picker = window.showDirectoryPicker;
  if (!picker) {
    throw new Error(
      "Folder import requires Chrome/Edge (File System Access API)",
    );
  }

  await requestPersistentStorage();
  const dirHandle = await picker({ mode: "read" });
  const createdAt = nowIso();

  const db = await getDb();
  const imported = await withStores(
    db,
    [STORE_PROJECTS, STORE_IMAGES],
    "readwrite",
    async (stores) => {
      const projectStore = stores[STORE_PROJECTS];
      const imageStore = stores[STORE_IMAGES];

      const project = await requestToPromise(
        projectStore.get(projectId) as IDBRequest<ProjectRecord | undefined>,
      );
      if (!project) throw new Error("Project not found");

      const imageIndex = imageStore.index("project_id");
      const existing = await requestToPromise(
        imageIndex.getAll(IDBKeyRange.only(projectId)) as IDBRequest<
          ImageRecord[]
        >,
      );
      const existingNames = new Set(existing.map((im) => im.filename));

      // Persist folder handle on the project.
      project.root_handle = dirHandle;
      project.updated_at = nowIso();
      await requestToPromise(
        projectStore.put(project) as IDBRequest<IDBValidKey>,
      );

      let count = 0;
      for await (const entry of walkDir(dirHandle)) {
        if (existingNames.has(entry.path)) continue;
        const record: Omit<ImageRecord, "id"> = {
          project_id: projectId,
          filename: entry.path,
          file_path: entry.path,
          width: null,
          height: null,
          created_at: createdAt,
          file_handle: entry.handle,
        };
        await requestToPromise(
          imageStore.add(record) as IDBRequest<IDBValidKey>,
        );
        existingNames.add(entry.path);
        count += 1;
      }
      return count;
    },
  );

  return { data: { imported } };
}

export async function getImageBlob(imageId: number): Promise<Blob> {
  const db = await getDb();
  const image = await withStore(db, STORE_IMAGES, "readonly", (store) =>
    requestToPromise(store.get(imageId) as IDBRequest<ImageRecord | undefined>),
  );
  if (!image) throw new Error("Image not found");
  if (image.blob) return image.blob;
  if (image.file_handle) {
    const fh = image.file_handle as unknown as {
      getFile: () => Promise<File>;
      queryPermission?: (opts?: {
        mode?: "read" | "readwrite";
      }) => Promise<string>;
      requestPermission?: (opts?: {
        mode?: "read" | "readwrite";
      }) => Promise<string>;
    };

    try {
      const perm = (await fh.queryPermission?.({ mode: "read" })) ?? "granted";
      if (perm !== "granted") {
        await fh.requestPermission?.({ mode: "read" });
      }
    } catch {
      // ignore permission API failures; getFile will throw if denied
    }

    const file = await fh.getFile();
    return file;
  }
  throw new Error("Image data missing");
}

// Annotations
export async function getAnnotations(
  imageId: number,
): Promise<ApiResponse<Annotation[]>> {
  const db = await getDb();
  const items = await withStore(db, STORE_ANNOTATIONS, "readonly", (store) => {
    const idx = store.index("image_id");
    return requestToPromise(
      idx.getAll(IDBKeyRange.only(imageId)) as IDBRequest<Annotation[]>,
    );
  });
  return { data: items };
}

export async function createAnnotation(
  imageId: number,
  data: Omit<Annotation, "id" | "image_id" | "created_at" | "updated_at">,
): Promise<ApiResponse<Annotation>> {
  const db = await getDb();
  const ts = nowIso();
  const record: Omit<Annotation, "id"> = {
    image_id: imageId,
    class_id: data.class_id,
    x_center: data.x_center,
    y_center: data.y_center,
    width: data.width,
    height: data.height,
    created_at: ts,
    updated_at: ts,
  };

  const id = await withStore(
    db,
    STORE_ANNOTATIONS,
    "readwrite",
    async (store) => {
      const key = await requestToPromise(
        store.add(record) as IDBRequest<IDBValidKey>,
      );
      return Number(key);
    },
  );

  return { data: { id, ...record } };
}

export async function updateAnnotation(
  annotationId: number,
  data: Omit<Annotation, "id" | "image_id" | "created_at" | "updated_at">,
): Promise<ApiResponse<Annotation>> {
  const db = await getDb();
  const updated = await withStore(
    db,
    STORE_ANNOTATIONS,
    "readwrite",
    async (store) => {
      const existing = await requestToPromise(
        store.get(annotationId) as IDBRequest<Annotation | undefined>,
      );
      if (!existing) throw new Error("Annotation not found");
      const next: Annotation = {
        ...existing,
        class_id: data.class_id,
        x_center: data.x_center,
        y_center: data.y_center,
        width: data.width,
        height: data.height,
        updated_at: nowIso(),
      };
      await requestToPromise(store.put(next) as IDBRequest<IDBValidKey>);
      return next;
    },
  );
  return { data: updated };
}

export async function deleteAnnotation(
  annotationId: number,
): Promise<ApiResponse<{ ok: true }>> {
  const db = await getDb();
  await withStore(db, STORE_ANNOTATIONS, "readwrite", (store) =>
    requestToPromise(store.delete(annotationId) as IDBRequest<unknown>).then(
      () => undefined,
    ),
  );
  return { data: { ok: true } };
}

// Export
function neurovaStem(filename: string): string {
  const base = filename.split("/").pop() ?? filename;
  return base.replace(/\.[^.]+$/, "");
}

export async function exportNeurova(
  projectId: number,
): Promise<ApiResponse<Blob>> {
  const db = await getDb();

  const project = await withStore(db, STORE_PROJECTS, "readonly", (store) =>
    requestToPromise(
      store.get(projectId) as IDBRequest<ProjectRecord | undefined>,
    ),
  );
  if (!project) throw new Error("Project not found");

  const images = await getImages(projectId);
  const classes = normalizeClassesString(project.classes)
    .split(",")
    .filter(Boolean);

  const zip = new JSZip();
  zip.file("classes.txt", classes.join("\n") + (classes.length ? "\n" : ""));

  for (const img of images.data) {
    const anns = await getAnnotations(img.id);
    if (!anns.data.length) continue;

    const lines = anns.data.map(
      (a) => `${a.class_id} ${a.x_center} ${a.y_center} ${a.width} ${a.height}`,
    );
    zip.file(
      `labels/${neurovaStem(img.filename)}.txt`,
      lines.join("\n") + "\n",
    );
  }

  const blob = await zip.generateAsync({ type: "blob" });
  return { data: blob };
}

export async function clearAllLocalData(): Promise<void> {
  try {
    const db = await getDb();
    db.close();
  } catch {
    // ignore
  }
  dbPromise = null;

  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });

  // Clear our localStorage keys (class colors)
  const keysToDelete: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.startsWith("bboxstudio:")) keysToDelete.push(k);
  }
  keysToDelete.forEach((k) => localStorage.removeItem(k));
}
