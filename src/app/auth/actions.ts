"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  redirectTarget,
  sanitizeUsername,
  validatePasswordSignUp,
} from "@/lib/auth-utils";
import { getSiteUrl } from "@/lib/env";

export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextPath = String(formData.get("next") ?? "");

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect(`/auth?error=${encodeURIComponent(error.message)}`);
  }

  if (data.user && !data.session && data.user.identities?.length === 0) {
    redirect(
      "/auth?error=" +
        encodeURIComponent("Compte non trouvé. Crée un compte ou vérifie ton email.")
    );
  }

  revalidatePath("/", "layout");
  redirect(redirectTarget(nextPath));
}

export async function signUpWithPassword(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const rawUsername = String(formData.get("username") ?? "").trim();
  const nextPath = String(formData.get("next") ?? "");

  const pwdError = validatePasswordSignUp(password);
  if (pwdError) {
    redirect("/auth?error=" + encodeURIComponent(pwdError));
  }

  const username = sanitizeUsername(rawUsername || email.split("@")[0] || "trainer");

  const supabase = await createClient();

  const baseUrl = getSiteUrl();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${baseUrl}/auth/callback`,
      data: { username },
    },
  });

  if (error) {
    redirect(`/auth?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");

  if (data.session) {
    redirect(redirectTarget(nextPath));
  }

  redirect("/auth?confirmed=1");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

import type { ForgotPasswordState, ResetPasswordState } from "./auth-state";

export async function requestPasswordReset(
  _prev: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { status: "error", message: "Indique ton email." };
  }

  const supabase = await createClient();
  const baseUrl = getSiteUrl();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${baseUrl}/auth/reset-password`,
  });

  if (error) {
    return { status: "error", message: error.message };
  }
  return {
    status: "success",
    message:
      "Un lien de réinitialisation a été envoyé à cette adresse. Vérifie ta boîte mail.",
  };
}

export async function updatePassword(
  _prev: ResetPasswordState,
  formData: FormData
): Promise<ResetPasswordState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 6) {
    return { status: "error", message: "Le mot de passe doit faire au moins 6 caractères." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { status: "error", message: error.message };
  }
  return {
    status: "success",
    message: "Mot de passe mis à jour. Tu peux te connecter.",
  };
}
