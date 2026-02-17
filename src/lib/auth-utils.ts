const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,30}$/;

export function redirectTarget(nextPath: string | null): string {
  const normalized = (nextPath ?? "").trim();
  if (!normalized || !normalized.startsWith("/")) {
    return "/profile";
  }
  // Avoid protocol-relative URLs and path confusion vectors.
  if (normalized.startsWith("//") || normalized.startsWith("/\\")) {
    return "/profile";
  }
  return normalized;
}

export function sanitizeUsername(raw: string): string {
  const trimmed = raw.trim();
  if (USERNAME_REGEX.test(trimmed)) return trimmed;
  const slug = trimmed.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 30);
  if (slug.length >= 3) return slug;
  return "trainer";
}

export function validatePasswordSignUp(password: string): string | null {
  if (password.length < 6) {
    return "Le mot de passe doit faire au moins 6 caractères.";
  }
  return null;
}
