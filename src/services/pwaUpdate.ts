type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;

let updateServiceWorker: UpdateServiceWorker | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;

export function setPwaUpdateService(fn: UpdateServiceWorker) {
  updateServiceWorker = fn;
}

export function setPwaRegistration(registration?: ServiceWorkerRegistration) {
  swRegistration = registration ?? null;
}

export async function refreshToLatestVersion(): Promise<boolean> {
  if (swRegistration) {
    await swRegistration.update();
  }

  if (!updateServiceWorker) {
    return false;
  }

  await updateServiceWorker(true);
  return true;
}

export async function hardRefreshApp() {
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }

  window.location.reload();
}
