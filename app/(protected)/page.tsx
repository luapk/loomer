'use client';

import { Suspense } from 'react';
import { StoryboardWorkspace } from './StoryboardWorkspace';

export default function HomePage() {
  return (
    <Suspense>
      <StoryboardWorkspace />
    </Suspense>
  );
}
