import { Routes, Route } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import ProjectList from "./pages/ProjectList";
import AnnotatePage from "./pages/AnnotatePage";
import ImagesPage from "./pages/ImagesPage.tsx";
import ExportPage from "./pages/ExportPage.tsx";
import MultiViewPage from "./pages/MultiViewPage.tsx";

function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<ProjectList />} />
        <Route path="/projects/:projectId/images" element={<ImagesPage />} />
        <Route path="/projects/:projectId/multi" element={<MultiViewPage />} />
        <Route
          path="/projects/:projectId/annotate"
          element={<AnnotatePage />}
        />
        <Route path="/projects/:projectId/export" element={<ExportPage />} />
      </Route>
    </Routes>
  );
}

export default App;
