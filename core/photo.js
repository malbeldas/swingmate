// Photos before upload (schema.md §11, BR-PRV-002, UC-032 E1). The browser decodes the file,
// scales it down and re-encodes it to JPEG, which drops EXIF (location, camera). This module holds
// the checks and sizes; the drawing lives in the page.

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024; // schema.md §11
export const AVATAR_MAX_PX = 800;
export const JPEG_QUALITY = 0.85;
// What people pick from a phone or laptop. Each one is re-encoded to JPEG before upload.
export const PHOTO_INPUT_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const PHOTO_TEXTS = {
  type: 'Choose a JPG, PNG or WebP photo.',
  size: 'That photo is over 5 MB. Choose a smaller one.',
  unreadable: "We couldn't read that photo. Try another one.",
};

// UC-032 E1: the reason, or null when the file can be read and re-encoded.
export function photoIssue({ type, size }) {
  if (!PHOTO_INPUT_TYPES.includes(type)) return 'type';
  if (!(size > 0) || size > PHOTO_MAX_BYTES) return 'size';
  return null;
}

// Keeps the aspect ratio and never enlarges.
export function scaleToFit(width, height, max = AVATAR_MAX_PX) {
  const ratio = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
}

// schema.md §11: {user_id}/{uuid}.jpg, so paths can't be guessed.
export function avatarPath(userId, uuid) {
  return `${userId}/${uuid}.jpg`;
}
