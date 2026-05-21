'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/src/components/ui/button';
import { Trash2, Pencil, Check, X } from 'lucide-react';

export function StoryboardRenameButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  async function save() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== title) {
      await fetch(`/api/storyboard/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      });
      router.refresh();
    }
    setEditing(false);
  }

  function cancel() {
    setDraft(title);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { void save(); }
            if (e.key === 'Escape') { cancel(); }
          }}
          className="flex-1 min-w-0 text-sm font-medium text-stone-900 bg-transparent border-b border-stone-400 focus:outline-none focus:border-stone-700 px-0 py-0.5"
        />
        <button type="button" onClick={() => void save()} title="Save" className="p-1 rounded hover:bg-stone-100 text-stone-500 hover:text-stone-900">
          <Check className="h-3.5 w-3.5" />
        </button>
        <button type="button" onClick={cancel} title="Cancel" className="p-1 rounded hover:bg-stone-100 text-stone-400 hover:text-stone-700">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      title="Rename project"
      onClick={() => { setDraft(title); setEditing(true); }}
      className="p-1 rounded hover:bg-stone-100 text-stone-400 hover:text-stone-700 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
  );
}

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
