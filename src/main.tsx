import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { createSessionAwareClient, installDescriptorSafeFetch, registerGlobalApiClient } from './lib/apiClient.ts';
import { auth } from './lib/firebase.ts';

const nativeFetch = window.fetch.bind(window);

export const sessionApiClient = createSessionAwareClient({
  rawFetch: nativeFetch,
  globalThisTarget: window,
  loginTimeoutMs: 6000,
  getFirebaseIdToken: async () => {
    try {
      if (auth?.currentUser) {
        return await auth.currentUser.getIdToken();
      }
    } catch {
      // fallback to session login if no Firebase client user is signed in
    }
    return null;
  },
});

registerGlobalApiClient(sessionApiClient);
installDescriptorSafeFetch(window, sessionApiClient);

sessionApiClient.ensureSession().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
