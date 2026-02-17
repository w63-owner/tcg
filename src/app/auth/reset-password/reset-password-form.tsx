"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { initialResetPasswordState } from "../auth-state";
import { updatePassword } from "../actions";

export function ResetPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    updatePassword,
    initialResetPasswordState
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (hash) {
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const type = params.get("type");
      if (type === "recovery" && accessToken && refreshToken) {
        void supabase.auth
          .setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(() => {
            if (typeof window !== "undefined") {
              window.history.replaceState(null, "", window.location.pathname);
            }
            setReady(true);
          })
          .catch(() => setReady(true));
        return;
      }
    }
    const t = setTimeout(() => setReady(true), 0);
    return () => clearTimeout(t);
  }, []);

  if (!ready) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-center text-sm">
            Vérification du lien…
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-1 text-center">
        <CardTitle>Nouveau mot de passe</CardTitle>
        <p className="text-muted-foreground text-sm">
          Choisis un mot de passe d’au moins 6 caractères.
        </p>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="reset-password">Nouveau mot de passe</Label>
            <Input
              id="reset-password"
              name="password"
              type="password"
              minLength={6}
              required
              autoComplete="new-password"
              placeholder="••••••••"
              disabled={state.status === "success"}
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={isPending || state.status === "success"}
          >
            {isPending ? "Mise à jour…" : "Enregistrer"}
          </Button>
        </form>
        {state.status === "success" && (
          <p className="text-muted-foreground mt-3 text-center text-sm">
            {state.message}{" "}
            <Link href="/auth" className="underline">
              Se connecter
            </Link>
          </p>
        )}
        {state.status === "error" && (
          <p className="text-destructive mt-3 text-center text-sm">
            {state.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
