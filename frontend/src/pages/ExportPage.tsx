import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, FileArchive } from "lucide-react";
import { exportNeurova, getProject, type Project } from "../api";
import "./ExportPage.css";

function normalizeClasses(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

export default function ExportPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId);

  const [project, setProject] = useState<Project | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await getProject(pid);
      setProject(res.data);
    })();
  }, [pid]);

  const classes = useMemo(
    () => normalizeClasses(project?.classes),
    [project?.classes],
  );

  const handleExport = async () => {
    setDownloading(true);
    try {
      const res = await exportNeurova(pid);
      const url = window.URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project?.name || "project"}_neurova.zip`;
      a.click();
      window.URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="export-page">
      <div className="export-header">
        <div>
          <h1>Export</h1>
          <p className="subtitle">Download annotations in Neurova format</p>
        </div>
      </div>

      <div className="panel">
        <div className="row">
          <div>
            <h2 className="panel-title">Neurova dataset (ZIP)</h2>
            <p className="panel-desc">
              Includes <code>classes.txt</code> and per-image label files under{" "}
              <code>labels/</code>.
            </p>
          </div>
          <button
            className="primary"
            onClick={handleExport}
            disabled={downloading}
          >
            <FileArchive size={16} />
            <span>{downloading ? "Preparing…" : "Download ZIP"}</span>
            <Download size={16} />
          </button>
        </div>

        <div className="classes">
          <div className="classes-title">Classes</div>
          {classes.length === 0 ? (
            <div className="classes-empty">
              No classes configured for this project.
            </div>
          ) : (
            <ol className="classes-list">
              {classes.map((c, idx) => (
                <li key={`${c}-${idx}`}>{c}</li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
