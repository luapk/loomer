'use client';

import { use, Suspense } from 'react';
import { StoryboardWorkspace } from '../../StoryboardWorkspace';

// Canonical deep-linkable route for a storyboard. Legacy /?sb={id} links
// hydrate the same workspace and upgrade themselves to this URL.
export default function StoryboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense>
      <StoryboardWorkspace initialStoryboardId={id} />
    </Suspense>
  );
}
