import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

type ProfileRow = {
  id: string;
  username: string;
  country_code: string;
  avatar_url: string | null;
  kyc_status: string;
};

type WalletRow = {
  user_id: string;
  available_balance: number;
  pending_balance: number;
  currency: string;
};

export default async function ProfilePage() {
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
      .select("id, username, country_code, avatar_url, kyc_status")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>(),
    supabase
      .from("wallets")
      .select("user_id, available_balance, pending_balance, currency")
      .eq("user_id", user.id)
      .maybeSingle<WalletRow>(),
  ]);

  return (
    <section className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Mon profil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="font-medium">Email:</span> {user.email}
          </p>
          <p>
            <span className="font-medium">Username:</span>{" "}
            {profile?.username ?? "A definir"}
          </p>
          <p>
            <span className="font-medium">Pays:</span>{" "}
            {profile?.country_code ?? "--"}
          </p>
          <div className="flex items-center gap-2">
            <span className="font-medium">KYC:</span>
            <Badge variant="secondary">{profile?.kyc_status ?? "UNVERIFIED"}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Wallet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="font-medium">Disponible:</span>{" "}
            {wallet?.available_balance?.toFixed(2) ?? "0.00"}{" "}
            {wallet?.currency ?? "EUR"}
          </p>
          <p>
            <span className="font-medium">En attente:</span>{" "}
            {wallet?.pending_balance?.toFixed(2) ?? "0.00"}{" "}
            {wallet?.currency ?? "EUR"}
          </p>
          <Button asChild variant="outline">
            <Link href="/wallet">Voir le detail wallet</Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
