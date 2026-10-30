/** Google Analytics 4 measurement. Cookies stay off until the viewer grants analytics consent. */
export const GA_MEASUREMENT_ID = 'G-3Y9X4LBRWH';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function applyAnalyticsConsent(granted: boolean): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('consent', 'update', { analytics_storage: granted ? 'granted' : 'denied' });
}
