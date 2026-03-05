import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

type SearchParams = { tx?: string; session_id?: string };

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const params = await searchParams;
  const transactionId = params.tx?.trim();

  return (
    <section className="mx-auto max-w-md space-y-6 py-8">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="h-8 w-8" aria-hidden />
            <CardTitle className="text-xl">Paiement réussi</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-sm">
            Ton paiement a bien été enregistré. Le vendeur a été notifié et
            pourra procéder à l&apos;envoi.
          </p>
          {transactionId && (
            <p className="font-mono text-xs text-muted-foreground">
              Transaction : {transactionId}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="default">
              <Link href="/profile/transactions">Voir mes transactions</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Retour à l&apos;accueil</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
