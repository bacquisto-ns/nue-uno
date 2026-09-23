import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { startSession } from './auth/session';
import { MotionProvider } from './motion/MotionProvider';
import { router } from './router';
import './styles.css';

startSession();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionProvider>
      <RouterProvider router={router} />
    </MotionProvider>
  </StrictMode>,
);
