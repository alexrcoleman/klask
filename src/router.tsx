import { Navigate, createBrowserRouter } from 'react-router';
import App from './App';
import GameRoute from './routes/GameRoute';

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
]);
