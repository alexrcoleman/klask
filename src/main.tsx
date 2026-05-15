import React from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { router } from './router';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing root element');
}

const app = (
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);

if (root.querySelector('.appShell')) {
  hydrateRoot(root, app);
} else {
  createRoot(root).render(app);
}
