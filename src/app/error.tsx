"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto max-w-xl space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-6">
      <h2 className="text-lg font-semibold">Une erreur inattendue est survenue</h2>
      <p className="text-muted-foreground text-sm">
        Recharge la vue ou retourne au marketplace.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={reset}>Reessayer</Button>
        <Button asChild variant="outline">
          <Link href="/">Retour marketplace</Link>
        </Button>
      </div>
    </section>
  );
}
