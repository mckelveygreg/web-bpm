type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;

let updateServiceWorker: UpdateServiceWorker | null = null;
let swRegistration: ServiceWorkerRegistration | null = null;
let updateReady = false;

export function setPwaUpdateService(fn: UpdateServiceWorker) {
  updateServiceWorker = fn;
}

export function setPwaRegistration(registration?: ServiceWorkerRegistration) {
  swRegistration = registration ?? null;
}

export function markPwaUpdateReady() {
  updateReady = true;
}

export async function refreshToLatestVersion(): Promise<boolean> {
  if (swRegistration) {
    await swRegistration.update();
  }

  if (!updateServiceWorker || !updateReady) {
    return false;
  }

  await updateServiceWorker(true);
  updateReady = false;
  return true;
}

export async function hardRefreshApp() {
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }

  window.location.reload();
}
