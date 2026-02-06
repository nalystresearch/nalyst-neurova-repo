import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getImages,
  uploadImages,
  importImagesFromFolder,
  getProject,
  type Image,
  type Project,
} from "../api";
import { Check, ExternalLink, LayoutGrid, Upload, X } from "lucide-react";
import useImageUrl from "../hooks/useImageUrl";
import "./ImagesPage.css";

const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=";

function ImageThumb({ image, className }: { image: Image; className: string }) {
  const src = useImageUrl(image.id);
  return (
    <img
      className={className}
      src={src || TRANSPARENT_PIXEL}
      alt={image.filename}
      loading="lazy"
    />
  );
}

export default function ImagesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId);

  const [project, setProject] = useState<Project | null>(null);
  const [images, setImages] = useState<Image[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<
    "newest" | "oldest" | "name_asc" | "name_desc"
  >("newest");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const load = async () => {
    setLoading(true);
    const [p, imgs] = await Promise.all([getProject(pid), getImages(pid)]);
    setProject(p.data);
    setImages(imgs.data);
    setLoading(false);
  };

  useEffect(() => {
    if (!Number.isFinite(pid)) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    await uploadImages(pid, files);
    await load();
  };

  const handleSelectFolder = async () => {
    try {
      await importImagesFromFolder(pid);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to import folder");
    }
  };

  const visibleImages = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? images.filter((img) => img.filename.toLowerCase().includes(q))
      : images;

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sort === "newest") {
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }
      if (sort === "oldest") {
        return (
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      }
      if (sort === "name_desc") return b.filename.localeCompare(a.filename);
      return a.filename.localeCompare(b.filename);
    });
    return sorted;
  }, [images, query, sort]);

  const toggleSelected = (imageId: number) => {
    setSelectedIds((prev) => {
      const exists = prev.includes(imageId);
      if (exists) return prev.filter((id) => id !== imageId);
      if (prev.length >= 6) return prev;
      return [...prev, imageId];
    });
  };

  const clearSelection = () => setSelectedIds([]);

  return (
    <div className="images-page">
      <div className="images-header">
        <div>
          <h1>{project?.name || "Images"}</h1>
          <p className="subtitle">Upload and browse images for this project</p>
        </div>

        <div className="images-header-actions">
          <button
            type="button"
            className="secondary"
            onClick={handleSelectFolder}
          >
            Select folder (Chrome)
          </button>

          <label className="upload-btn">
            <Upload size={16} />
            <span>Upload files</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              hidden
            />
          </label>
        </div>
      </div>

      <div className="images-toolbar">
        <div className="left">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search images…"
            aria-label="Search images"
          />
          <select
            className="sort-select"
            value={sort}
            onChange={(e) =>
              setSort(
                e.target.value as
                  | "newest"
                  | "oldest"
                  | "name_asc"
                  | "name_desc",
              )
            }
            aria-label="Sort images"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name_asc">Name (A–Z)</option>
            <option value="name_desc">Name (Z–A)</option>
          </select>
        </div>

        <div className="right">
          {selectMode && (
            <span className="selection-pill">
              <LayoutGrid size={16} />
              <span>Selected {selectedIds.length}/6</span>
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  className="secondary clear-selection-btn"
                  aria-label="Clear selection"
                  title="Clear selection"
                  onClick={clearSelection}
                >
                  <X size={16} />
                </button>
              )}
            </span>
          )}

          <button
            type="button"
            className="select-toggle"
            onClick={() => {
              setSelectMode((v) => !v);
              clearSelection();
            }}
          >
            {selectMode ? "Done" : "Select"}
          </button>

          {selectMode && selectedIds.length >= 1 && (
            <Link
              to={`/projects/${pid}/multi?imageIds=${selectedIds.join(",")}`}
              className="primary-link primary-link-no-margin"
            >
              Open {selectedIds.length} images
            </Link>
          )}
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading…</div>
      ) : images.length === 0 ? (
        <div className="empty">
          <h2>No images yet</h2>
          <p>Upload some images to start annotating.</p>
          <Link to={`/projects/${pid}/annotate`} className="primary-link">
            Go to Annotate
          </Link>
        </div>
      ) : visibleImages.length === 0 ? (
        <div className="empty">
          <h2>No results</h2>
          <p>Try a different search.</p>
          <button
            type="button"
            className="secondary"
            onClick={() => setQuery("")}
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="grid">
          {visibleImages.map((img) => (
            <div className="card" key={img.id}>
              {selectMode && (
                <button
                  type="button"
                  className="select-check"
                  onClick={() => toggleSelected(img.id)}
                  aria-label={
                    selectedIds.includes(img.id)
                      ? "Deselect image"
                      : "Select image"
                  }
                >
                  {selectedIds.includes(img.id) && <Check size={18} />}
                </button>
              )}
              <ImageThumb image={img} className="thumb" />
              <div className="meta">
                <div className="filename" title={img.filename}>
                  {img.filename}
                </div>
                <Link
                  className="annotate-link"
                  to={`/projects/${pid}/annotate?imageId=${img.id}`}
                >
                  <ExternalLink size={16} />
                  <span>Annotate</span>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
