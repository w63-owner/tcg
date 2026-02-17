import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function WalletReturnPage() {
  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle>Retour Stripe Connect</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          Ton retour d&apos;onboarding Stripe a bien ete recu. Le statut KYC sera
          synchronise automatiquement.
        </p>
        <Button asChild>
          <Link href="/wallet">Retour au wallet</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
