import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {
  createSessionAwareClient,
  installDescriptorSafeFetch,
  purgeSensitiveBrowserCaches,
  registerGlobalApiClient,
  resolveRestoredFirebaseIdToken,
} from './lib/apiClient.ts';
import { auth } from './lib/firebase.ts';

const nativeFetch = window.fetch.bind(window);

export const sessionApiClient = createSessionAwareClient({
  rawFetch: nativeFetch,
  globalThisTarget: window,
  loginTimeoutMs: 6000,
  allowLocalTestBootstrap: false,
  getFirebaseIdToken: () => resolveRestoredFirebaseIdToken(auth),
});

registerGlobalApiClient(sessionApiClient);
installDescriptorSafeFetch(window, sessionApiClient);

void (async () => {
  await purgeSensitiveBrowserCaches();
  await sessionApiClient.ensureSession();
})().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
