import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DocumentSummaryDto,
  MemberDto,
  ProjectDto,
  UserDto,
  WorkspaceDto,
} from '@sigma/validation';
import { ApiRequestError, http } from './api';
import { toast } from '../components/ui/toast';

export const keys = {
  workspaces: (all: boolean) => ['workspaces', all] as const,
  workspace: (id: string) => ['workspace', id] as const,
  members: (id: string) => ['members', id] as const,
  projects: (id: string) => ['projects', id] as const,
  project: (id: string) => ['project', id] as const,
  documents: (projectId: string) => ['documents', projectId] as const,
  users: ['users'] as const,
};

export const useWorkspaces = (all = false) =>
  useQuery({
    queryKey: keys.workspaces(all),
    queryFn: () => http.get<WorkspaceDto[]>(`/workspaces${all ? '?all=true' : ''}`),
  });
export const useWorkspace = (id: string) =>
  useQuery({
    queryKey: keys.workspace(id),
    queryFn: () => http.get<WorkspaceDto>(`/workspaces/${id}`),
    enabled: !!id,
  });
export const useMembers = (id: string) =>
  useQuery({
    queryKey: keys.members(id),
    queryFn: () => http.get<MemberDto[]>(`/workspaces/${id}/members`),
  });
export const useProjects = (id: string) =>
  useQuery({
    queryKey: keys.projects(id),
    queryFn: () => http.get<ProjectDto[]>(`/workspaces/${id}/projects`),
  });
export const useProject = (id: string) =>
  useQuery({
    queryKey: keys.project(id),
    queryFn: () => http.get<ProjectDto>(`/projects/${id}`),
    enabled: !!id,
  });
export const useDocuments = (projectId: string) =>
  useQuery({
    queryKey: keys.documents(projectId),
    queryFn: () => http.get<DocumentSummaryDto[]>(`/projects/${projectId}/documents`),
  });
export const useUsers = () =>
  useQuery({ queryKey: keys.users, queryFn: () => http.get<UserDto[]>('/users') });

export function errorText(e: unknown): string {
  return e instanceof ApiRequestError ? e.message : (e as Error)?.message || 'Something went wrong';
}

/** Mutation helper: invalidates the given keys and toasts errors. */
export function useApiMutation<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  invalidate: readonly (readonly unknown[])[],
  onSuccess?: (r: TResult) => void,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      invalidate.forEach((k) => void qc.invalidateQueries({ queryKey: k }));
      onSuccess?.(r);
    },
    onError: (e) => toast.error(errorText(e)),
  });
}
