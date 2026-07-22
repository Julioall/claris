import { Route } from 'react-router-dom';

import { AcceptInvitePage, ForgotPasswordPage, LoginPage, ResetPasswordPage } from './lazy-pages';
import { PublicRoute } from './PublicRoute';

export function renderPublicRoutes() {
  return (
    <>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
      <Route path="/auth/accept-invite" element={<AcceptInvitePage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
    </>
  );
}
