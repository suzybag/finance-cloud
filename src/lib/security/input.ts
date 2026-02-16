const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

export const sanitizeFreeText = (value: unknown, maxLength = 2000) => {
  const raw = String(value ?? "")
    .replace(CONTROL_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!raw) return "";
  return raw.slice(0, Math.max(1, maxLength));
};

export const sanitizeEmail = (value: unknown, maxLength = 254) => {
  const email = sanitizeFreeText(value, maxLength).toLowerCase();
  if (!email) return "";
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return valid ? email : "";
};

