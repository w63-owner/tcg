/**
 * QA: tests fonctionnels de la logique auth (utils + state).
 */
import {
  redirectTarget,
  sanitizeUsername,
  validatePasswordSignUp,
} from "@/lib/auth-utils";
import { initialForgotPasswordState, initialResetPasswordState } from "@/app/auth/auth-state";

describe("Auth QA – redirectTarget", () => {
  it("retourne /profile si next vide ou invalide", () => {
    expect(redirectTarget("")).toBe("/profile");
    expect(redirectTarget(null)).toBe("/profile");
    expect(redirectTarget("http://evil.com")).toBe("/profile");
    expect(redirectTarget("//evil.com")).toBe("/profile");
    expect(redirectTarget("/\\evil")).toBe("/profile");
  });

  it("retourne next si chemin relatif valide", () => {
    expect(redirectTarget("/offers")).toBe("/offers");
    expect(redirectTarget("/listing/123")).toBe("/listing/123");
    expect(redirectTarget("/profile")).toBe("/profile");
  });
});

describe("Auth QA – sanitizeUsername", () => {
  it("conserve un pseudo valide 3-30 car", () => {
    expect(sanitizeUsername("abc")).toBe("abc");
    expect(sanitizeUsername("Trainer_42")).toBe("Trainer_42");
    expect(sanitizeUsername("user-name")).toBe("user-name");
  });

  it("nettoie les caractères interdits et tronque à 30", () => {
    expect(sanitizeUsername("  user@mail  ")).toBe("usermail");
    expect(sanitizeUsername("a".repeat(35))).toHaveLength(30);
  });

  it("retourne trainer si trop court après nettoyage", () => {
    expect(sanitizeUsername("ab")).toBe("trainer");
    expect(sanitizeUsername("  @.  ")).toBe("trainer");
  });
});

describe("Auth QA – validatePasswordSignUp", () => {
  it("accepte 6 caractères ou plus", () => {
    expect(validatePasswordSignUp("123456")).toBeNull();
    expect(validatePasswordSignUp("longpassword")).toBeNull();
  });

  it("refuse moins de 6 caractères", () => {
    expect(validatePasswordSignUp("12345")).not.toBeNull();
    expect(validatePasswordSignUp("")).not.toBeNull();
  });
});

describe("Auth QA – auth-state", () => {
  it("états initiaux sont idle", () => {
    expect(initialForgotPasswordState.status).toBe("idle");
    expect(initialResetPasswordState.status).toBe("idle");
  });
});
