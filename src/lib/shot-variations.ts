export interface ShotVariation {
  id: string;
  label: string;
  prompt: string; // injected into Director's note
}

export interface VariationGroup {
  id: string;
  label: string;
  variations: ShotVariation[];
}

export const SHOT_VARIATION_GROUPS: VariationGroup[] = [
  {
    id: 'framing',
    label: 'Framing',
    variations: [
      { id: 'tighter', label: 'Tighter', prompt: 'Push in — tighter framing on subject, more intimate and intense.' },
      { id: 'wider', label: 'Wider', prompt: 'Pull back — wider framing revealing more environment, subject smaller.' },
      { id: 'insert', label: 'Insert / CU', prompt: 'Extreme close-up insert — isolate a specific detail or object within the scene.' },
      { id: 'xcu', label: 'Extreme Close Up', prompt: 'Extreme close-up on face — eyes, hands, or mouth filling the entire frame. Maximum intimacy and psychological intensity.' },
      { id: 'ots', label: 'Over-the-shoulder', prompt: 'Over-the-shoulder composition — figure in foreground partially occluding, subject beyond.' },
      { id: 'pov_fisheye', label: 'POV / Fisheye', prompt: 'First-person POV with extreme fisheye lens — barrel-distorted wide-angle perspective warping the scene edges, immersive and disorienting, as if seen through a peephole or action-camera.' },
    ],
  },
  {
    id: 'angle',
    label: 'Angle',
    variations: [
      { id: 'low', label: 'Low angle', prompt: 'Low camera angle looking up — subjects dominant, powerful, looming.' },
      { id: 'high', label: 'High angle', prompt: 'High camera angle looking down — subjects small, vulnerable, observed.' },
      { id: 'dutch', label: 'Dutch tilt', prompt: 'Canted Dutch angle — frame tilted, psychological unease or disorientation.' },
      { id: 'overhead', label: 'Overhead', prompt: "Directly overhead bird's-eye view — god's-eye perspective, voyeuristic." },
    ],
  },
  {
    id: 'lighting',
    label: 'Lighting',
    variations: [
      { id: 'noir', label: 'High contrast', prompt: 'High contrast low-key lighting — single hard source, deep shadows, noir register.' },
      { id: 'soft', label: 'Soft / diffused', prompt: 'Soft diffused high-key lighting — minimal shadows, gentle and naturalistic.' },
      { id: 'silhouette', label: 'Silhouette', prompt: 'Subjects as silhouettes against bright background — contre-jour, mysterious.' },
      { id: 'golden', label: 'Golden hour', prompt: 'Warm golden hour light — long shadows, amber fill, magic hour.' },
      { id: 'practical', label: 'Practical sources', prompt: 'Lit by practical sources only — lamps, screens, candles, windows motivating all light.' },
    ],
  },
  {
    id: 'depth',
    label: 'Depth',
    variations: [
      { id: 'shallow', label: 'Shallow focus', prompt: 'Shallow depth of field — subject sharp, background and foreground blurred to bokeh.' },
      { id: 'deep', label: 'Deep focus', prompt: 'Deep focus — foreground, subject, and background all sharp simultaneously.' },
      { id: 'foreground', label: 'Foreground element', prompt: 'Strong out-of-focus foreground element framing or partially obscuring the scene.' },
    ],
  },
  {
    id: 'register',
    label: 'Register',
    variations: [
      { id: 'tension', label: 'Heighten tension', prompt: 'Heighten psychological tension — claustrophobic framing, oppressive composition.' },
      { id: 'epic', label: 'Epic scale', prompt: 'Grand scale — vast environment, characters dwarfed by their surroundings.' },
      { id: 'intimate', label: 'More intimate', prompt: 'More intimate and private — close, personal, a moment of vulnerability.' },
    ],
  },
  {
    id: 'expression',
    label: 'Expression',
    variations: [
      { id: 'fear', label: 'Fear', prompt: "Character expression: wide-eyed fear or dread — pupils dilated, brow raised, jaw tense." },
      { id: 'grief', label: 'Grief', prompt: "Character expression: raw grief or anguish — eyes glistening, mouth drawn, weight of loss visible." },
      { id: 'joy', label: 'Joy', prompt: "Character expression: genuine joy or laughter — eyes crinkled, open smile, light and alive." },
      { id: 'rage', label: 'Rage', prompt: "Character expression: barely-contained rage — jaw set, eyes narrowed, temples tight." },
      { id: 'resolve', label: 'Resolve', prompt: "Character expression: quiet determination — steady gaze, composed face, inner decision made." },
      { id: 'shock', label: 'Shock', prompt: "Character expression: sudden shock or disbelief — frozen, mouth slightly open, caught off-guard." },
    ],
  },
];
