import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY?.trim();

export function getResendClient(): Resend | null {
  if (!apiKey) {
    return null;
  }
  return new Resend(apiKey);
}

export const RESEND_FROM =
  process.env.RESEND_FROM_EMAIL?.trim() || "onboarding@resend.dev";
