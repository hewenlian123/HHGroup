"use client";

import { createContext, useContext } from "react";
import { useSearchParams } from "next/navigation";

// Existing field pages also run inside the project workspace, without a second CRUD implementation.
export const ProjectWorkspaceContext = createContext<string | null>(null);

export function useProjectWorkspaceScope() {
  const embeddedProjectId = useContext(ProjectWorkspaceContext);
  const searchParams = useSearchParams();
  return {
    projectId: embeddedProjectId ?? searchParams.get("project_id") ?? "",
    embedded: embeddedProjectId !== null,
  };
}
