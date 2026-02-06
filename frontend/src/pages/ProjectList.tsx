import { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2, Folder } from "lucide-react";
import {
  getProjects,
  createProject,
  deleteProject,
  clearAllLocalData,
  type Project,
} from "../api";
import "./ProjectList.css";

function normalizeClasses(value: string): string {
  return value
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .join(",");
}

export default function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<
    "newest" | "oldest" | "name_asc" | "name_desc"
  >("newest");
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    classes: "",
  });

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    const res = await getProjects();
    setProjects(res.data);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = normalizeClasses(formData.classes);
    await createProject({
      name: formData.name,
      description: formData.description || undefined,
      classes: cleaned,
    });
    setFormData({ name: "", description: "", classes: "" });
    setShowCreate(false);
    loadProjects();
  };

  const handleDelete = async (id: number) => {
    if (confirm("Delete this project?")) {
      await deleteProject(id);
      loadProjects();
    }
  };

  const handleClearAll = async () => {
    if (
      !confirm(
        "Clear all local data? This removes all projects, images, and annotations saved in this browser.",
      )
    ) {
      return;
    }
    await clearAllLocalData();
    await loadProjects();
  };

  const visibleProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? projects.filter((p) => {
          const hay = `${p.name} ${p.description ?? ""}`.toLowerCase();
          return hay.includes(q);
        })
      : projects;

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
      if (sort === "name_desc") return b.name.localeCompare(a.name);
      return a.name.localeCompare(b.name);
    });
    return sorted;
  }, [projects, query, sort]);

  return (
    <div className="container">
      <header className="header">
        <div>
          <h1>
            <span className="header-title-row">
              <Folder size={20} />
              <span>BBox Studio</span>
            </span>
          </h1>
          <p className="subtitle">Neurova</p>
        </div>
        <div className="header-actions">
          <button type="button" className="secondary" onClick={handleClearAll}>
            Clear Data
          </button>
          <button type="button" onClick={() => setShowCreate(true)}>
            <span className="btn-icon-row">
              <Plus size={16} />
              <span>New Project</span>
            </span>
          </button>
        </div>
      </header>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Create New Project</h2>
            <form onSubmit={handleCreate}>
              <div className="form-group">
                <label>Project Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="My Dataset"
                  required
                />
              </div>
              <div className="form-group">
                <label>Description (optional)</label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Object detection dataset for YOLO"
                  rows={3}
                />
              </div>
              <div className="form-group">
                <label>Classes (comma-separated)</label>
                <input
                  type="text"
                  value={formData.classes}
                  onChange={(e) =>
                    setFormData({ ...formData, classes: e.target.value })
                  }
                  placeholder="bottle,logo,cap"
                  required
                />
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </button>
                <button type="submit">Create Project</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="projects-controls">
        <div className="left">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects…"
            aria-label="Search projects"
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
            aria-label="Sort projects"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name_asc">Name (A–Z)</option>
            <option value="name_desc">Name (Z–A)</option>
          </select>
        </div>

        <div className="right">
          <span className="badge">{visibleProjects.length} shown</span>
        </div>
      </div>

      <div className="projects-grid">
        {visibleProjects.map((project) => (
          <div key={project.id} className="project-card">
            <div className="project-header">
              <h3>{project.name}</h3>
              <button
                className="danger"
                onClick={() => handleDelete(project.id)}
                aria-label="Delete project"
              >
                <Trash2 size={16} />
              </button>
            </div>
            {project.description && (
              <p className="project-desc">{project.description}</p>
            )}
            <div className="project-meta">
              <span className="badge">
                {project.classes.split(",").length} classes
              </span>
              <span className="date">
                {new Date(project.created_at).toLocaleDateString()}
              </span>
            </div>
            <Link
              to={`/projects/${project.id}/annotate`}
              className="btn-annotate"
            >
              Open Project →
            </Link>
          </div>
        ))}
        {visibleProjects.length === 0 && !showCreate && (
          <div className="empty-state">
            {projects.length === 0 ? (
              <>
                <h2>No projects yet</h2>
                <p>Create your first project to start annotating images</p>
                <button onClick={() => setShowCreate(true)}>
                  + Create Project
                </button>
              </>
            ) : (
              <>
                <h2>No results</h2>
                <p>Try a different search.</p>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setQuery("")}
                >
                  Clear search
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
