"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialForgotPasswordState } from "../auth-state";
import { requestPasswordReset } from "../actions";

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    requestPasswordReset,
    initialForgotPasswordState
  );

  return (
    <form action={formAction} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="forgot-email">Email</Label>
        <Input
          id="forgot-email"
          name="email"
          type="email"
          required
          placeholder="toi@exemple.fr"
          autoComplete="email"
          disabled={state.status === "success"}
        />
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Envoi en cours…" : "Envoyer le lien"}
      </Button>
      {state.status === "success" && (
        <p className="text-muted-foreground text-center text-sm">
          {state.message}
        </p>
      )}
      {state.status === "error" && (
        <p className="text-destructive text-center text-sm">{state.message}</p>
      )}
    </form>
  );
}
