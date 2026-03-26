import { Route } from 'react-router-dom';

import { LoginPage } from './lazy-pages';
import { PublicRoute } from './PublicRoute';

export function renderPublicRoutes() {
  return (
    <Route
      path="/login"
      element={(
        <PublicRoute>
          <LoginPage />
        </PublicRoute>
      )}
    />
  );
}
