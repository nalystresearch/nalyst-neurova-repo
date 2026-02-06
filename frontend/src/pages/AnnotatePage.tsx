import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import {
  getProject,
  getImages,
  uploadImages,
  importImagesFromFolder,
  getAnnotations,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  updateProject,
  type Project,
  type Image,
} from "../api";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Trash2,
  Hand,
  Plus,
} from "lucide-react";
import useImageUrl from "../hooks/useImageUrl";
import "./AnnotatePage.css";

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

type ClassColorMap = Record<string, string>;

const DEFAULT_CLASS_COLORS = [
  "#22c55e", // green
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#ef4444", // red
  "#a855f7", // purple
  "#06b6d4", // cyan
  "#f97316", // orange
  "#84cc16", // lime
  "#e11d48", // rose
  "#14b8a6", // teal
];

function getDefaultColor(index: number) {
  return DEFAULT_CLASS_COLORS[index % DEFAULT_CLASS_COLORS.length];
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

interface Box {
  id?: number;
  classId: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export default function AnnotatePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const [project, setProject] = useState<Project | null>(null);
  const [images, setImages] = useState<Image[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [selectedClassId, setSelectedClassId] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const [drawStartPos, setDrawStartPos] = useState({ x: 0, y: 0 });
  const [currentBox, setCurrentBox] = useState<Box | null>(null);
  const [selectedBox, setSelectedBox] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [classColors, setClassColors] = useState<ClassColorMap>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const panStartRef = useRef({ x: 0, y: 0 });
  const panPointerStartRef = useRef({ x: 0, y: 0 });
  const bottomScrollerRef = useRef<HTMLDivElement>(null);

  const classes = useMemo(() => {
    const raw = project?.classes ?? "";
    return raw
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
  }, [project?.classes]);

  useEffect(() => {
    loadProject();
  }, [projectId]);

  const colorsStorageKey = useMemo(() => {
    const pid = Number(projectId);
    return Number.isFinite(pid) ? `bboxstudio:project:${pid}:classColors` : "";
  }, [projectId]);

  // Load colors from localStorage when project changes
  useEffect(() => {
    if (!colorsStorageKey) return;
    const stored = safeJsonParse<ClassColorMap>(
      localStorage.getItem(colorsStorageKey),
      {},
    );
    setClassColors(stored);
  }, [colorsStorageKey]);

  // Ensure every class has a color (and persist)
  useEffect(() => {
    if (!colorsStorageKey) return;
    if (classes.length === 0) return;

    setClassColors((prev) => {
      let changed = false;
      const next: ClassColorMap = { ...prev };

      classes.forEach((cls, idx) => {
        if (!next[cls]) {
          next[cls] = getDefaultColor(idx);
          changed = true;
        }
      });

      // Drop colors for removed classes
      for (const key of Object.keys(next)) {
        if (!classes.includes(key)) {
          delete next[key];
          changed = true;
        }
      }

      if (changed) {
        localStorage.setItem(colorsStorageKey, JSON.stringify(next));
      }
      return next;
    });
  }, [classes, colorsStorageKey]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedBox !== null) {
          void handleDeleteBox();
        }
        return;
      }

      // 1..9 selects classes 0..8
      const n = Number(e.key);
      if (Number.isFinite(n) && n >= 1 && n <= 9) {
        const idx = n - 1;
        if (idx < classes.length) {
          setSelectedClassId(idx);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [classes.length, selectedBox]);

  useEffect(() => {
    if (images.length > 0) {
      loadImageAnnotations();
    }
  }, [currentImageIndex, images]);

  useEffect(() => {
    drawCanvas();
  }, [boxes, selectedBox, currentBox, zoom, pan]);

  const getClassColorById = (classId: number) => {
    const name = classes[classId];
    if (!name) return getDefaultColor(classId);
    return classColors[name] || getDefaultColor(classId);
  };

  const loadProject = async () => {
    const res = await getProject(Number(projectId));
    setProject(res.data);
    const imagesRes = await getImages(Number(projectId));
    setImages(imagesRes.data);

    const requestedImageId = Number(searchParams.get("imageId"));
    if (requestedImageId && imagesRes.data.length > 0) {
      const idx = imagesRes.data.findIndex((im) => im.id === requestedImageId);
      if (idx >= 0) setCurrentImageIndex(idx);
    }
  };

  const loadImageAnnotations = async () => {
    const image = images[currentImageIndex];
    if (!image) return;

    const res = await getAnnotations(image.id);
    setBoxes(
      res.data.map((ann) => ({
        id: ann.id,
        classId: ann.class_id,
        x: ann.x_center - ann.width / 2,
        y: ann.y_center - ann.height / 2,
        width: ann.width,
        height: ann.height,
      })),
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    await uploadImages(Number(projectId), files);
    loadProject();
  };

  const handleSelectFolder = async () => {
    try {
      await importImagesFromFolder(Number(projectId));
      await loadProject();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to import folder");
    }
  };

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !image.complete) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    // Draw boxes
    const allBoxes = currentBox ? [...boxes, currentBox] : boxes;
    allBoxes.forEach((box, idx) => {
      const isSelected = idx === selectedBox;
      const color = getClassColorById(box.classId);
      ctx.strokeStyle = color;
      ctx.lineWidth = (isSelected ? 3 : 2) / zoom;
      ctx.strokeRect(
        box.x * canvas.width,
        box.y * canvas.height,
        box.width * canvas.width,
        box.height * canvas.height,
      );

      if (isSelected) {
        ctx.save();
        ctx.setLineDash([6 / zoom, 4 / zoom]);
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 1.5 / zoom;
        ctx.strokeRect(
          box.x * canvas.width,
          box.y * canvas.height,
          box.width * canvas.width,
          box.height * canvas.height,
        );
        ctx.restore();
      }

      // Class label
      const className = classes[box.classId] || `Class ${box.classId}`;
      const fontSize = 14 / zoom;
      ctx.font = `${fontSize}px sans-serif`;
      const textX = box.x * canvas.width;
      const textY = box.y * canvas.height - 5 / zoom;

      // Background pill for readability
      const paddingX = 6 / zoom;
      const paddingY = 4 / zoom;
      const textWidth = ctx.measureText(className).width;
      const rectW = textWidth + paddingX * 2;
      const rectH = fontSize + paddingY * 2;
      const rectX = textX;
      const rectY = textY - rectH;

      ctx.fillStyle = color;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(rectX, rectY, rectW, rectH);
      ctx.globalAlpha = 1;

      ctx.fillStyle = "#ffffff";
      ctx.fillText(className, textX + paddingX, textY - paddingY);
    });

    ctx.restore();
  };

  const hitTestBoxIndex = (x: number, y: number) => {
    // x/y are normalized canvas coords [0..1]
    for (let i = boxes.length - 1; i >= 0; i--) {
      const b = boxes[i];
      const x1 = Math.min(b.x, b.x + b.width);
      const y1 = Math.min(b.y, b.y + b.height);
      const x2 = Math.max(b.x, b.x + b.width);
      const y2 = Math.max(b.y, b.y + b.height);
      if (x >= x1 && x <= x2 && y >= y1 && y <= y2) return i;
    }
    return null;
  };

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    // Convert from CSS pixels -> canvas internal pixels
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;

    // Account for pan/zoom (pan is in canvas internal pixels)
    const x = (px - pan.x) / zoom / canvas.width;
    const y = (py - pan.y) / zoom / canvas.height;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.shiftKey) {
      setIsPanning(true);
      panStartRef.current = pan;
      panPointerStartRef.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const pos = getCanvasCoordinates(e);

    // If clicking an existing box, select it instead of drawing a new one
    const hit = hitTestBoxIndex(pos.x, pos.y);
    if (hit !== null) {
      setSelectedBox(hit);
      return;
    }

    // Clicking empty space clears selection
    setSelectedBox(null);

    setDrawing(true);
    setDrawStartPos(pos);
    setCurrentBox({
      classId: selectedClassId,
      x: pos.x,
      y: pos.y,
      width: 0,
      height: 0,
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;

      setPan({
        x:
          panStartRef.current.x +
          (e.clientX - panPointerStartRef.current.x) * scaleX,
        y:
          panStartRef.current.y +
          (e.clientY - panPointerStartRef.current.y) * scaleY,
      });
      return;
    }

    if (!drawing || !currentBox) return;

    const pos = getCanvasCoordinates(e);
    setCurrentBox({
      ...currentBox,
      width: pos.x - drawStartPos.x,
      height: pos.y - drawStartPos.y,
    });
  };

  const handleMouseUp = async () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (!drawing || !currentBox) return;

    setDrawing(false);
    if (
      Math.abs(currentBox.width) > 0.01 &&
      Math.abs(currentBox.height) > 0.01
    ) {
      const normalizedBox = {
        classId: currentBox.classId,
        x:
          currentBox.width < 0 ? currentBox.x + currentBox.width : currentBox.x,
        y:
          currentBox.height < 0
            ? currentBox.y + currentBox.height
            : currentBox.y,
        width: Math.abs(currentBox.width),
        height: Math.abs(currentBox.height),
      };

      const image = images[currentImageIndex];
      const res = await createAnnotation(image.id, {
        class_id: normalizedBox.classId,
        x_center: normalizedBox.x + normalizedBox.width / 2,
        y_center: normalizedBox.y + normalizedBox.height / 2,
        width: normalizedBox.width,
        height: normalizedBox.height,
      });

      setBoxes([...boxes, { ...normalizedBox, id: res.data.id }]);
    }
    setCurrentBox(null);
  };

  const handleDeleteBox = async () => {
    if (selectedBox === null) return;
    await handleDeleteBoxAtIndex(selectedBox);
  };

  const handleDeleteBoxAtIndex = async (idx: number) => {
    const box = boxes[idx];
    if (!box) return;
    if (box.id) {
      await deleteAnnotation(box.id);
    }
    setBoxes((prev) => prev.filter((_, i) => i !== idx));
    setSelectedBox((prevSel) => {
      if (prevSel === null) return null;
      if (prevSel === idx) return null;
      if (prevSel > idx) return prevSel - 1;
      return prevSel;
    });
  };

  const handleChangeSelectedBoxClass = async (classId: number) => {
    if (selectedBox === null) return;
    const box = boxes[selectedBox];
    if (!box?.id) {
      setBoxes(
        boxes.map((b, idx) => (idx === selectedBox ? { ...b, classId } : b)),
      );
      return;
    }

    await updateAnnotation(box.id, {
      class_id: classId,
      x_center: box.x + box.width / 2,
      y_center: box.y + box.height / 2,
      width: box.width,
      height: box.height,
    });

    setBoxes(
      boxes.map((b, idx) => (idx === selectedBox ? { ...b, classId } : b)),
    );
  };

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    const name = newClassName.trim();
    if (!name) return;

    const existing = new Set(classes.map((c) => c.toLowerCase()));
    if (existing.has(name.toLowerCase())) {
      setNewClassName("");
      return;
    }

    const next = [...classes, name].join(",");
    const res = await updateProject(project.id, { classes: next });
    setProject(res.data);
    setNewClassName("");
    setSelectedClassId(classes.length);
  };

  const currentImage = images[currentImageIndex];
  const currentImageUrl = useImageUrl(currentImage?.id);

  return (
    <div className="annotate-page">
      <div className="sidebar">
        <div className="sidebar-header">
          <Link to="/" className="back-link">
            <span className="back-link-row">
              <ArrowLeft size={16} />
              <span>Back</span>
            </span>
          </Link>
          <h2>{project?.name}</h2>
        </div>

        <div className="section">
          <h3>Upload Images</h3>
          <div className="upload-actions">
            <button
              type="button"
              className="secondary"
              onClick={handleSelectFolder}
            >
              Select folder (Chrome)
            </button>
          </div>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileUpload}
            className="file-input"
            aria-label="Upload images"
            title="Upload images"
          />
        </div>

        <div className="section">
          <h3>Classes</h3>
          <div className="classes-list">
            {classes.map((cls, idx) => (
              <div key={idx} className="class-row">
                <button
                  type="button"
                  className={
                    selectedClassId === idx ? "class-btn active" : "class-btn"
                  }
                  onClick={() => setSelectedClassId(idx)}
                >
                  <span className="class-btn-inner">
                    <svg
                      className="class-color-dot"
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      aria-hidden="true"
                    >
                      <circle
                        cx="6"
                        cy="6"
                        r="5"
                        fill={classColors[cls] || getDefaultColor(idx)}
                        stroke="currentColor"
                        strokeWidth="1"
                      />
                    </svg>
                    <span className="class-name">{cls}</span>
                  </span>
                </button>
                <input
                  className="class-color-input"
                  type="color"
                  value={classColors[cls] || getDefaultColor(idx)}
                  onChange={(e) => {
                    const nextColor = e.target.value;
                    setClassColors((prev) => {
                      const next = { ...prev, [cls]: nextColor };
                      if (colorsStorageKey) {
                        localStorage.setItem(
                          colorsStorageKey,
                          JSON.stringify(next),
                        );
                      }
                      return next;
                    });
                  }}
                  aria-label={`Pick color for ${cls}`}
                  title={`Pick color for ${cls}`}
                />
              </div>
            ))}
          </div>

          <form onSubmit={handleAddClass} className="add-class-row">
            <input
              type="text"
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              placeholder="Add a new class (e.g. bottle)"
            />
            <button type="submit" className="add-class-btn" title="Add class">
              <Plus size={16} />
            </button>
          </form>

          {selectedBox !== null && (
            <div className="selected-box-controls">
              <div className="hint hint-tight">Selected box: change class</div>
              <select
                value={boxes[selectedBox]?.classId ?? 0}
                onChange={(e) =>
                  void handleChangeSelectedBoxClass(Number(e.target.value))
                }
                aria-label="Change selected box class"
                title="Change selected box class"
              >
                {classes.map((c, idx) => (
                  <option key={`${c}-${idx}`} value={idx}>
                    {idx + 1}. {c}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="section">
          <h3>Controls</h3>
          <div className="controls">
            <button onClick={() => setZoom(zoom * 1.2)}>
              <ZoomIn size={16} />
              <span>Zoom in</span>
            </button>
            <button onClick={() => setZoom(zoom / 1.2)}>
              <ZoomOut size={16} />
              <span>Zoom out</span>
            </button>
            <button
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
            >
              <RotateCcw size={16} />
              <span>Reset view</span>
            </button>
            <button
              onClick={handleDeleteBox}
              disabled={selectedBox === null}
              className="danger"
            >
              <Trash2 size={16} />
              <span>Delete box</span>
            </button>
          </div>
          <p className="hint">
            <span className="controls-hint-row">
              <Hand size={14} />
              <span>
                Shift + drag to pan • 1–9 selects class • Delete removes
                selected box
              </span>
            </span>
          </p>
        </div>

        <div className="section">
          <h3>Boxes ({boxes.length})</h3>
          {boxes.length === 0 ? (
            <p className="hint">No boxes on this image yet</p>
          ) : (
            <div className="boxes-list">
              {boxes.map((b, idx) => {
                const name = classes[b.classId] || `Class ${b.classId}`;
                const color = getClassColorById(b.classId);
                const isSel = selectedBox === idx;
                return (
                  <div
                    key={b.id ?? `box-${idx}`}
                    className={isSel ? "box-row active" : "box-row"}
                  >
                    <button
                      type="button"
                      className="box-select"
                      onClick={() => setSelectedBox(idx)}
                      aria-label={`Select box: ${name}`}
                      title={name}
                    >
                      <svg
                        className="box-color"
                        width="10"
                        height="10"
                        viewBox="0 0 10 10"
                        aria-hidden="true"
                      >
                        <circle
                          cx="5"
                          cy="5"
                          r="4"
                          fill={color}
                          stroke="currentColor"
                          strokeWidth="1"
                        />
                      </svg>
                      <span className="box-name">{name}</span>
                    </button>
                    <button
                      className="box-delete"
                      onClick={() => void handleDeleteBoxAtIndex(idx)}
                      aria-label="Delete box"
                      title="Delete box"
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="section">
          <h3>Images ({images.length})</h3>
          <div className="images-list">
            {images.map((img, idx) => (
              <div
                key={img.id}
                className={
                  idx === currentImageIndex ? "image-item active" : "image-item"
                }
                onClick={() => {
                  setCurrentImageIndex(idx);
                  setSelectedBox(null);
                }}
              >
                <div className="image-item-left">
                  <ImageThumb image={img} className="image-thumb" />
                  <div className="image-filename" title={img.filename}>
                    {img.filename}
                  </div>
                </div>
                <div className="image-index" aria-hidden="true">
                  {idx + 1}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="workspace">
        {currentImage ? (
          <>
            <img
              ref={imageRef}
              src={currentImageUrl || TRANSPARENT_PIXEL}
              alt="Current"
              hidden
              onLoad={drawCanvas}
              crossOrigin="anonymous"
            />
            <div className="canvas-wrap">
              <canvas
                ref={canvasRef}
                width={800}
                height={600}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                className={
                  isPanning ? "annotation-canvas panning" : "annotation-canvas"
                }
              />
            </div>

            <div className="bottom-strip">
              <div className="bottom-strip-head">
                <div className="status">
                  Image {currentImageIndex + 1} of {images.length} |{" "}
                  {boxes.length} boxes
                </div>

                <div className="strip-actions">
                  <button
                    type="button"
                    className="strip-btn"
                    onClick={() =>
                      bottomScrollerRef.current?.scrollBy({
                        left: -360,
                        behavior: "smooth",
                      })
                    }
                    aria-label="Scroll images left"
                    title="Scroll left"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    type="button"
                    className="strip-btn"
                    onClick={() =>
                      bottomScrollerRef.current?.scrollBy({
                        left: 360,
                        behavior: "smooth",
                      })
                    }
                    aria-label="Scroll images right"
                    title="Scroll right"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
              <div className="bottom-strip-title">Images ({images.length})</div>

              <div
                className="bottom-strip-scroller"
                role="list"
                ref={bottomScrollerRef}
              >
                {images.map((img, idx) => {
                  const isActive = idx === currentImageIndex;
                  return (
                    <button
                      key={img.id}
                      type="button"
                      role="listitem"
                      className={isActive ? "thumb-item active" : "thumb-item"}
                      onClick={() => {
                        setCurrentImageIndex(idx);
                        setSelectedBox(null);
                      }}
                      title={img.filename}
                      aria-label={`Open image ${idx + 1}: ${img.filename}`}
                    >
                      <ImageThumb image={img} className="thumb-img" />
                      <div className="thumb-name">
                        {idx + 1}. {img.filename}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="empty-workspace">
            <h2>No images yet</h2>
            <p>Upload images to start annotating</p>
          </div>
        )}
      </div>
    </div>
  );
}
