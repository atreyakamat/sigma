import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Toaster } from '../components/ui/toast';
import { AuthProvider } from '../features/authentication/AuthProvider';
import { ChangePasswordPage } from '../features/authentication/ChangePasswordPage';
import { LoginPage } from '../features/authentication/LoginPage';
import { ProtectedRoute } from '../features/authentication/ProtectedRoute';
import { EditorPage } from '../features/editor/EditorPage';
import { ProjectPage } from '../features/projects/ProjectPage';
import { AdminUsersPage } from '../features/settings/AdminUsersPage';
import { TokensPage } from '../features/settings/TokensPage';
import { SecurityPage } from '../features/settings/SecurityPage';
import { AuditPage } from '../features/settings/AuditPage';
import { AiProvidersPage } from '../features/settings/AiProvidersPage';
import { SetupPage } from '../features/setup/SetupPage';
import { PreviewPage } from '../features/prototype/PreviewPage';
import { WorkspacePage } from '../features/workspace/WorkspacePage';
import { WorkspacesPage } from '../features/workspace/WorkspacesPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5_000 } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/setup" element={<SetupPage />} />
            <Route path="/share/:token" element={<EditorPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/change-password" element={<ChangePasswordPage />} />
              <Route path="/" element={<WorkspacesPage />} />
              <Route path="/w/:workspaceId" element={<WorkspacePage />} />
              <Route path="/w/:workspaceId/p/:projectId" element={<ProjectPage />} />
              <Route path="/file/:documentId" element={<EditorPage />} />
              <Route path="/file/:documentId/preview" element={<PreviewPage />} />
              <Route path="/settings/tokens" element={<TokensPage />} />
              <Route path="/settings/security" element={<SecurityPage />} />
            </Route>
            <Route element={<ProtectedRoute admin />}>
              <Route path="/admin/users" element={<AdminUsersPage />} />
              <Route path="/admin/audit" element={<AuditPage />} />
              <Route path="/admin/ai" element={<AiProvidersPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
