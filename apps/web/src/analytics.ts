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

/** Personalised ads need ad storage; off keeps Google's consent mode on non-personalised. */
export function applyAdvertisingConsent(personalised: boolean): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  const value = personalised ? 'granted' : 'denied';
  window.gtag('consent', 'update', {
    ad_storage: value,
    ad_user_data: value,
    ad_personalization: value,
  });
}
