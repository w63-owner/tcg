/**
 * Chaos: inputs invalides, erreurs Supabase simulées.
 */
import {
  requestPasswordReset,
  updatePassword,
} from "@/app/auth/actions";
import { initialForgotPasswordState, initialResetPasswordState } from "@/app/auth/auth-state";

const mockResetPasswordForEmail = jest.fn();
const mockUpdateUser = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(() =>
    Promise.resolve({
      auth: {
        resetPasswordForEmail: mockResetPasswordForEmail,
        updateUser: mockUpdateUser,
      },
    })
  ),
}));

beforeEach(() => {
  mockResetPasswordForEmail.mockReset();
  mockUpdateUser.mockReset();
});

describe("Chaos – requestPasswordReset", () => {
  it("email vide → erreur", async () => {
    const formData = new FormData();
    formData.set("email", "");
    const out = await requestPasswordReset(initialForgotPasswordState, formData);
    expect(out.status).toBe("error");
    expect(out.message).toContain("Indique ton email");
  });

  it("Supabase retourne une erreur → status error", async () => {
    const formData = new FormData();
    formData.set("email", "user@example.com");
    mockResetPasswordForEmail.mockResolvedValueOnce({
      error: { message: "Rate limit exceeded" },
    });
    const out = await requestPasswordReset(initialForgotPasswordState, formData);
    expect(out.status).toBe("error");
    expect(out.message).toBe("Rate limit exceeded");
  });

  it("Supabase throw → rejet", async () => {
    const formData = new FormData();
    formData.set("email", "user@example.com");
    mockResetPasswordForEmail.mockRejectedValueOnce(new Error("Network error"));
    await expect(
      requestPasswordReset(initialForgotPasswordState, formData)
    ).rejects.toThrow("Network error");
  });

  it("Supabase success → status success", async () => {
    const formData = new FormData();
    formData.set("email", "user@example.com");
    mockResetPasswordForEmail.mockResolvedValueOnce({ error: null });
    const out = await requestPasswordReset(initialForgotPasswordState, formData);
    expect(out.status).toBe("success");
    expect(out.message).toContain("lien");
  });
});

describe("Chaos – updatePassword", () => {
  it("mot de passe < 6 caractères → erreur", async () => {
    const formData = new FormData();
    formData.set("password", "12345");
    const out = await updatePassword(initialResetPasswordState, formData);
    expect(out.status).toBe("error");
    expect(out.message).toContain("6 caractères");
  });

  it("mot de passe vide → erreur", async () => {
    const formData = new FormData();
    const out = await updatePassword(initialResetPasswordState, formData);
    expect(out.status).toBe("error");
  });

  it("Supabase updateUser erreur → status error", async () => {
    const formData = new FormData();
    formData.set("password", "validpassword");
    mockUpdateUser.mockResolvedValueOnce({
      error: { message: "Invalid refresh token" },
    });
    const out = await updatePassword(initialResetPasswordState, formData);
    expect(out.status).toBe("error");
    expect(out.message).toBe("Invalid refresh token");
  });

  it("Supabase success → status success", async () => {
    const formData = new FormData();
    formData.set("password", "validpassword");
    mockUpdateUser.mockResolvedValueOnce({ error: null });
    const out = await updatePassword(initialResetPasswordState, formData);
    expect(out.status).toBe("success");
  });
});
