// Shared types for reference still generation — used by API routes and client UI.

export interface EntityStillState {
  status: 'pending' | 'generating' | 'done' | 'error';
  candidates: string[]; // Vercel Blob public URLs
  selected: string | null;
  // The selected URL at the time shot prompts were last synced from this
  // entity's reference image. selected !== synced_url means the entity is
  // "dirty" and sync-prompts will re-analyse it.
  synced_url?: string | null;
  error?: string;
}

export type ReferenceStills = Record<string, EntityStillState>;

export interface RefEntity {
  id: string;
  name: string;
  type: 'character' | 'location' | 'prop';
  reference_still_prompt: string;
  // Aspect ratio hint for Imagen
  aspectRatio: '1:1' | '3:4' | '16:9';
}
