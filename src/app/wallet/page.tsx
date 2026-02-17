import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

type ProfileRow = {
  stripe_account_id: string | null;
  kyc_status: string;
};

type WalletRow = {
  available_balance: number;
  pending_balance: number;
  currency: string;
};

export default async function WalletPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const [{ data: profile }, { data: wallet }] = await Promise.all([
    supabase
      .from("profiles")
      .select("stripe_account_id, kyc_status")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>(),
    supabase
      .from("wallets")
      .select("available_balance, pending_balance, currency")
      .eq("user_id", user.id)
      .maybeSingle<WalletRow>(),
  ]);

  const needsKyc = !profile || ["REQUIRED", "UNVERIFIED"].includes(profile.kyc_status);

  return (
    <section className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Solde</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm">
            Disponible:{" "}
            <span className="font-semibold">
              {wallet?.available_balance?.toFixed(2) ?? "0.00"}{" "}
              {wallet?.currency ?? "EUR"}
            </span>
          </p>
          <p className="text-sm">
            En attente:{" "}
            <span className="font-semibold">
              {wallet?.pending_balance?.toFixed(2) ?? "0.00"}{" "}
              {wallet?.currency ?? "EUR"}
            </span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Virement bancaire</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            Statut KYC:
            <Badge variant={needsKyc ? "destructive" : "secondary"}>
              {profile?.kyc_status ?? "UNVERIFIED"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Si le KYC est requis, rediriger vers Stripe Onboarding avant
            autorisation de virement.
          </p>
          <Button disabled={needsKyc} className="w-full">
            Demander un virement
          </Button>
          {needsKyc ? (
            <Button variant="outline" className="w-full">
              Completer mon KYC (Stripe Connect)
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
