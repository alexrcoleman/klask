export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) {
    return;
  }

  window.addEventListener('load', () => {
    const baseUrl = import.meta.env.BASE_URL;

    navigator.serviceWorker
      .register(`${baseUrl}sw.js`, { scope: baseUrl })
      .then((registration) => registration.update())
      .catch((error: unknown) => {
        console.warn('Klask Lab service worker registration failed.', error);
      });
  });
}
