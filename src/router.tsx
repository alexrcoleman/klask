import { Navigate, createBrowserRouter } from 'react-router';
import App from './App';
import GameRoute from './routes/GameRoute';

const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: App,
    children: [
      {
        index: true,
        Component: GameRoute,
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
], { basename });
