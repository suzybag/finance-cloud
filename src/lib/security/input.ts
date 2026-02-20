const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;
const HTML_ANGLE_BRACKETS = /[<>]/g;
const DIGITS_ONLY = /\D+/g;
const CARD_SENSITIVE_PATTERN = /(?:\bcvv\b|\bcvc\b|\bpin\b|\bsenha\b|(?:\d[ -]?){13,19})/i;

export const sanitizeFreeText = (value: unknown, maxLength = 2000) => {
  const raw = String(value ?? "")
    .replace(CONTROL_CHARS, " ")
    .replace(/\s+/g, " ")
    .replace(HTML_ANGLE_BRACKETS, "")
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

export const sanitizeOtpCode = (value: unknown) =>
  String(value ?? "").replace(DIGITS_ONLY, "").slice(0, 6);

export const hasCardSensitiveData = (value: unknown) => {
  const text = sanitizeFreeText(value, 500);
  if (!text) return false;
  return CARD_SENSITIVE_PATTERN.test(text);
};

export const validateStrongPassword = (password: string) => {
  if (!password || password.length < 10) {
    return "A senha deve ter no minimo 10 caracteres.";
  }
  if (!/[A-Z]/.test(password)) {
    return "A senha precisa de ao menos 1 letra maiuscula.";
  }
  if (!/[a-z]/.test(password)) {
    return "A senha precisa de ao menos 1 letra minuscula.";
  }
  if (!/\d/.test(password)) {
    return "A senha precisa de ao menos 1 numero.";
  }
  if (!/[^\w\s]/.test(password)) {
    return "A senha precisa de ao menos 1 simbolo.";
  }
  return null;
};
