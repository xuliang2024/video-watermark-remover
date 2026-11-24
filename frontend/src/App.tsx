import { useEffect, useState } from 'react';
import { LandingPage } from './pages/LandingPage';
import { WorkspacePage } from './pages/WorkspacePage';
import type { WorkspaceViewId } from './types';

const VALID_VIEWS: WorkspaceViewId[] = [
  'overview',
  'inpaint',
  'translate',
  'annotate',
  'monitor',
  'compare',
  'translate-result',
  'subtitle-style',
  'billing',
];

function parseRoute(): { page: 'landing' | 'workspace'; view: WorkspaceViewId } {
  const path = window.location.pathname;
  const hash = window.location.hash.replace(/^#\/?/, '') as WorkspaceViewId;
  if (path.startsWith('/workspace')) {
    return {
      page: 'workspace',
      view: VALID_VIEWS.includes(hash) ? hash : 'overview',
    };
  }
  return { page: 'landing', view: 'overview' };
}

export default function App() {
  const [route, setRoute] = useState(parseRoute);

  useEffect(() => {
    const sync = () => setRoute(parseRoute());
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);

  function enterWorkspace(view: WorkspaceViewId = 'overview') {
    const url = view === 'overview' ? '/workspace' : `/workspace#${view}`;
    window.history.pushState({}, '', url);
    setRoute({ page: 'workspace', view });
  }

  function goHome() {
    window.history.pushState({}, '', '/');
    setRoute({ page: 'landing', view: 'overview' });
  }

  function syncWorkspaceView(view: WorkspaceViewId) {
    const url = view === 'overview' ? '/workspace' : `/workspace#${view}`;
    window.history.replaceState({}, '', url);
  }

  if (route.page === 'workspace') {
    return (
      <WorkspacePage
        initialView={route.view}
        onGoHome={goHome}
        onViewChange={syncWorkspaceView}
      />
    );
  }

  return <LandingPage onEnterWorkspace={enterWorkspace} />;
}
