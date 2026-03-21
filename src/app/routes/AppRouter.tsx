import { Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { NotFoundPage } from './lazy-pages';
import { renderAdminRoutes } from './admin-routes';
import { renderPrivateRoutes } from './private-routes';
import { renderPublicRoutes } from './public-routes';
import { RouteLoadingScreen } from './RouteLoadingScreen';

const routerBasename = import.meta.env.BASE_URL === '/'
  ? '/'
  : import.meta.env.BASE_URL.replace(/\/$/, '');

export function AppRouter() {
  return (
    <BrowserRouter basename={routerBasename} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Suspense fallback={<RouteLoadingScreen />}>
        <Routes>
          {renderPublicRoutes()}
          {renderPrivateRoutes()}
          {renderAdminRoutes()}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
