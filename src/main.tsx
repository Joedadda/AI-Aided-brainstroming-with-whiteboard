import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles.css';

// Focus rings show only for keyboard users: Tab turns them on, a pointer press turns them off.
window.addEventListener('keydown', (e) => e.key === 'Tab' && document.documentElement.setAttribute('data-keys', ''), true);
window.addEventListener('pointerdown', () => document.documentElement.removeAttribute('data-keys'), true);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Development only: inspect state from the console.
if (import.meta.env.DEV) {
  void import('./store.ts').then(({ useStore }) => Object.assign(window, { __store: useStore }));
}
