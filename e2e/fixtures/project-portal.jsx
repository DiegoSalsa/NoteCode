import { createRoot } from "react-dom/client";
import ProjectPortal from "../../components/commercial/ProjectPortal";

const root = createRoot(document.getElementById("root"));
export function showProject(projectId) {
  root.render(<ProjectPortal projectId={projectId} />);
}
