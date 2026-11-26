import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installScrollbarReveal } from './scrollbars';
import './styles/index.css';
import { installThemeWatcher } from './theme';
import { takeAddDraftLink } from './screens/plugins/draftLink';

installScrollbarReveal();
installThemeWatcher();
// Before anything renders or logs: the studio's #add-draft= link holds a secret.
takeAddDraftLink();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
