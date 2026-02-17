"use client";

import { Button } from "@/components/ui/button";

export default function OfflinePage() {
  return (
    <section className="mx-auto max-w-md space-y-3 rounded-xl border p-6 text-center">
      <h1 className="text-xl font-semibold">Vous etes hors ligne</h1>
      <p className="text-muted-foreground text-sm">
        Connectez-vous a Internet pour retrouver les nouvelles annonces.
      </p>
      <Button onClick={() => window.location.reload()}>Recharger</Button>
    </section>
  );
}
