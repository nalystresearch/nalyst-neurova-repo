import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { getImages, getProject, type Image, type Project } from "../api";
import { ArrowLeft, ExternalLink } from "lucide-react";
import useImageUrl from "../hooks/useImageUrl";
import "./MultiViewPage.css";

const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=";

function ImageThumb({ image }: { image: Image }) {
  const src = useImageUrl(image.id);
  return (
    <img
      className="multi-thumb"
      src={src || TRANSPARENT_PIXEL}
      alt={image.filename}
      loading="lazy"
    />
  );
}

function parseImageIds(value: string | null): number[] {
  if (!value) return [];
  const ids = value
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  // Unique, preserve order, limit to 6
  const out: number[] = [];
  for (const id of ids) {
    if (!out.includes(id)) out.push(id);
    if (out.length >= 6) break;
  }
  return out;
}

export default function MultiViewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId);
  const [searchParams] = useSearchParams();

  const [project, setProject] = useState<Project | null>(null);
  const [images, setImages] = useState<Image[]>([]);
  const [loading, setLoading] = useState(true);

  const selectedIds = useMemo(
    () => parseImageIds(searchParams.get("imageIds")),
    [searchParams],
  );

  useEffect(() => {
    if (!Number.isFinite(pid)) return;
    (async () => {
      setLoading(true);
      const [p, imgs] = await Promise.all([getProject(pid), getImages(pid)]);
      setProject(p.data);
      setImages(imgs.data);
      setLoading(false);
    })();
  }, [pid]);

  const selectedImages = useMemo(() => {
    if (selectedIds.length === 0) return [];
    const map = new Map(images.map((im) => [im.id, im] as const));
    return selectedIds.map((id) => map.get(id)).filter(Boolean) as Image[];
  }, [images, selectedIds]);

  const gridCols = useMemo(() => {
    const n = selectedImages.length;
    if (n <= 1) return 1;
    if (n <= 4) return 2;
    return 3;
  }, [selectedImages.length]);

  return (
    <div className="multi-page">
      <div className="multi-header">
        <div className="left">
          <Link to={`/projects/${pid}/images`} className="back">
            <ArrowLeft size={16} />
            <span>Back to Images</span>
          </Link>
          <div>
            <h1>Multi-view</h1>
            <p className="subtitle">
              {project?.name ? `${project.name} · ` : ""}Viewing{" "}
              {selectedImages.length} image
              {selectedImages.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading…</div>
      ) : selectedIds.length === 0 ? (
        <div className="empty">
          <h2>No images selected</h2>
          <p>Go back to Images and select 1–6 images to open together.</p>
          <Link to={`/projects/${pid}/images`} className="primary-link">
            Choose images
          </Link>
        </div>
      ) : selectedImages.length === 0 ? (
        <div className="empty">
          <h2>Nothing to show</h2>
          <p>Those images weren’t found in this project.</p>
          <Link to={`/projects/${pid}/images`} className="primary-link">
            Back to Images
          </Link>
        </div>
      ) : (
        <div className={`multi-grid cols-${gridCols}`}>
          {selectedImages.map((img) => (
            <div key={img.id} className="multi-card">
              <ImageThumb image={img} />
              <div className="multi-meta">
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
