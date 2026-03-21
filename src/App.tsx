import { AppProviders } from '@/app/providers/AppProviders';
import { AppRouter } from '@/app/routes/AppRouter';

const App = () => (
  <AppProviders>
    <AppRouter />
  </AppProviders>
);

export default App;
