'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/button';
import { Trash2 } from 'lucide-react';

export function StoryboardRowActions({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setDeleting(true);
    await fetch(`/api/storyboard/${id}`, { method: 'DELETE' });
    router.refresh();
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-stone-500">Delete?</span>
        <Button
          size="sm"
          variant="destructive"
          onClick={handleDelete}
          disabled={deleting}
          className="h-7 px-2 text-xs"
        >
          {deleting ? 'Deleting…' : 'Yes, delete'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setConfirming(false)}
          disabled={deleting}
          className="h-7 px-2 text-xs"
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={handleDelete}
      className="h-7 w-7 p-0 text-stone-400 hover:text-red-500 hover:bg-red-50"
      title="Delete storyboard"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}
