// A very small path router.
//
// The app is one page with a handful of real URLs (/tiers, /account, /legal/terms, a shared
// match, a commander's record). That needs history, back-button support and shareable links
// — not a routing library. The service serves index.html for these paths so a deep link or a
// refresh lands in the right place.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

interface RouteValue {
  path: string;
  search: URLSearchParams;
  navigate(to: string, options?: { replace?: boolean }): void;
  /** Match `/commanders/:handle` style patterns; returns params or null. */
  match(pattern: string): Record<string, string> | null;
}

const RouteContext = createContext<RouteValue | null>(null);

export function useRoute(): RouteValue {
  const value = useContext(RouteContext);
  if (!value) throw new Error('useRoute used outside RouterProvider');
  return value;
}

function matchPath(pattern: string, path: string): Record<string, string> | null {
  const want = pattern.split('/').filter(Boolean);
  const have = path.split('/').filter(Boolean);
  if (want.length !== have.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(':')) params[want[i].slice(1)] = decodeURIComponent(have[i]);
    else if (want[i] !== have[i]) return null;
  }
  return params;
}

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState(() => `${window.location.pathname}${window.location.search}`);

  useEffect(() => {
    const onPop = () => setLocation(`${window.location.pathname}${window.location.search}`);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string, options: { replace?: boolean } = {}) => {
    const target = to.startsWith('/') ? to : `/${to}`;
    if (options.replace) window.history.replaceState(null, '', target);
    else window.history.pushState(null, '', target);
    setLocation(target);
    // A new page starts at the top, as a page navigation would.
    window.scrollTo({ top: 0 });
  }, []);

  const value = useMemo<RouteValue>(() => {
    const [path, query = ''] = location.split('?');
    return {
      path: path.replace(/\/+$/, '') || '/',
      search: new URLSearchParams(query),
      navigate,
      match: (pattern: string) => matchPath(pattern, path),
    };
  }, [location, navigate]);

  return <RouteContext.Provider value={value}>{children}</RouteContext.Provider>;
}

/** An ordinary link that routes in-page, so middle-click and "open in new tab" still work. */
export function Link({ to, children, className, onClick }: {
  to: string; children: React.ReactNode; className?: string; onClick?: () => void;
}) {
  const { navigate } = useRoute();
  return <a href={to} className={className} onClick={event => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onClick?.();
    navigate(to);
  }}>{children}</a>;
}
