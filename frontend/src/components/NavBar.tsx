import { NavLink, useParams } from "react-router-dom";
import { useMemo } from "react";
import { Folder, Images, PencilRuler, Download, Scan } from "lucide-react";
import "./NavBar.css";

export default function NavBar() {
  const { projectId } = useParams<{ projectId: string }>();

  // Build links back to the landing homepage (works in dev and when served at /app/ on Pages).
  const {
    homeHref,
    productsHref,
    docsHref,
    contactHref,
    nalystDocsHref,
    neurovaDocsHref,
  } = useMemo(() => {
    const base = window.location.pathname.split("/app")[0] || "";
    const root = `${base}/index.html`.replace(/\/+/g, "/");
    const anchor = (id: string) => `${root}#${id}`;

    return {
      homeHref: root,
      productsHref: anchor("products"),
      docsHref: anchor("docs"),
      contactHref: anchor("contact"),
      nalystDocsHref: `${base}/mk-docs/nalyst/index.html`.replace(/\/+/g, "/"),
      neurovaDocsHref: `${base}/mk-docs/neurova/index.html`.replace(
        /\/+/g,
        "/",
      ),
    };
  }, []);

  return (
    <header className="topnav">
      <div className="topnav-inner">
        <a className="brand" href={homeHref}>
          <Scan size={18} />
          <span>BBox Studio</span>
        </a>

        <nav className="landing-links" aria-label="Site">
          <a href={homeHref}>Home</a>
          <a href={productsHref}>Products</a>
          <a href={docsHref}>Docs</a>
          <a href={contactHref}>Contact</a>
          <a href={nalystDocsHref}>Nalyst Docs</a>
          <a href={neurovaDocsHref}>Neurova Docs</a>
        </nav>

        <nav className="links" aria-label="Annotator">
          <NavLink
            to="/"
            className={({ isActive }) => (isActive ? "active" : "")}
            end
          >
            <Folder size={16} />
            <span>Projects</span>
          </NavLink>

          {projectId && (
            <>
              <NavLink
                to={`/projects/${projectId}/images`}
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                <Images size={16} />
                <span>Images</span>
              </NavLink>
              <NavLink
                to={`/projects/${projectId}/annotate`}
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                <PencilRuler size={16} />
                <span>Annotate</span>
              </NavLink>
              <NavLink
                to={`/projects/${projectId}/export`}
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                <Download size={16} />
                <span>Export</span>
              </NavLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
