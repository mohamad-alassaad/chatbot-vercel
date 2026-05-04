"use client";

import useSWR, { useSWRConfig } from "swr";
import { fetcher } from "@/lib/utils";

export type ProjectListItem = {
  id: string;
  userId: string;
  tenantId: string | null;
  name: string;
  description: string | null;
  systemPrompt: string | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
  chatCount: number;
};

type ProjectsResponse = {
  projects: ProjectListItem[];
};

const PROJECTS_KEY = "/api/projects";

export function useProjects() {
  const { data, error, isLoading, mutate } = useSWR<ProjectsResponse>(
    PROJECTS_KEY,
    fetcher,
    { revalidateOnFocus: false }
  );
  return {
    projects: data?.projects ?? [],
    error,
    isLoading,
    mutate,
  };
}

export function useProjectsRefresh() {
  const { mutate } = useSWRConfig();
  return () => mutate(PROJECTS_KEY);
}
