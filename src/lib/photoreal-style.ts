// Cinematic photoreal style definition — shared across all generation routes.
// Anchors the model to a specific camera/lens/grade signature before any
// reference images are injected, so photographic medium is locked early.

export const PHOTOREAL_STYLE =
  'Shot on Arri Alexa 35 with anamorphic lenses — Panavision C-Series or Atlas Orion glass. ' +
  'Oval bokeh on out-of-focus highlights. Subtle horizontal lens breathing. Natural vignette. ' +
  'Cinematography in the tradition of Roger Deakins — controlled, precise, every light source ' +
  'motivated by the scene — and Greig Fraser — clean, epic, slightly underexposed, textured. ' +
  'Lighting is always motivated: practical sources, natural light bounced and shaped, no studio-flat ' +
  'three-point rigs, no artificial fill. ' +
  'Colour temperature tracks the scene exactly — warm amber for interiors and golden hour, ' +
  'cold blue-grey for night and overcast exteriors, neutral for daylight — never forced or uniform. ' +
  'Grade: slightly underexposed overall, lifted blacks, desaturated midtones, naturalistic skin tones. ' +
  'No teal-and-orange push. No crushed blacks. No HDR processing. No CGI render quality. ' +
  'Organic 35mm film grain — textured and present, never digital noise, never clean. ' +
  'PHOTOREALISTIC PHOTOGRAPH. NOT an illustration, NOT a painting, NOT a sketch, NOT watercolour, ' +
  'NOT digital art, NOT anime, NOT cartoon. Naturalistic human anatomy throughout.';

// Depth-of-field directive derived from the shot's scale grammar field.
// Injected into the style declaration so the model locks focus intent before
// it processes any reference images.
export function buildDofLine(scale: string): string {
  const s = (scale ?? '').toLowerCase().replace(/[-_]/g, ' ');
  if (s === 'ecu' || s.includes('extreme close')) {
    return 'Depth of field: extreme shallow — subject razor-sharp, background dissolved entirely to abstraction.';
  }
  if (s === 'cu' || s === 'bcl' || (s.includes('close') && !s.includes('medium') && !s.includes('wide'))) {
    return 'Depth of field: shallow — subject and immediate foreground sharp, background soft and painterly.';
  }
  if (s === 'mcu' || s === 'ots' || s.includes('medium close') || s.includes('over the shoulder')) {
    return 'Depth of field: shallow-to-medium — subject sharp, background softening naturally behind.';
  }
  if (s === 'ms' || s.includes('medium shot')) {
    return 'Depth of field: medium — foreground crisp, mid-background beginning to soften.';
  }
  if (s === 'mws' || s === 'mls' || s.includes('medium wide')) {
    return 'Depth of field: medium-to-deep — near and mid-ground sharp, far background softening.';
  }
  if (s === 'ws' || s.includes('wide shot')) {
    return 'Depth of field: deep — foreground through mid-ground sharp, far distance softening.';
  }
  if (s === 'ews' || s.includes('extreme wide') || s.includes('establishing')) {
    return 'Depth of field: hyperfocal — near-everything in focus, vast space rendered in full detail.';
  }
  return 'Depth of field: natural and appropriate to focal length and subject distance.';
}
