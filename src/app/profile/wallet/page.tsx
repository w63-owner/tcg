import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

type WalletRow = {
  available_balance: number;
  pending_balance: number;
  currency: string;
};

type TransactionRow = {
  id: string;
  total_amount: number;
  fee_amount: number;
  shipping_cost: number;
  created_at: string;
  listing_title: string | null;
  listing: { title: string } | Array<{ title: string }> | null;
};

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString("fr-FR");
}

export default async function ProfileWalletPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const [{ data: wallet }, { data: sales }] = await Promise.all([
    supabase
      .from("wallets")
      .select("available_balance, pending_balance, currency")
      .eq("user_id", user.id)
      .maybeSingle<WalletRow>(),
    supabase
      .from("transactions")
      .select("id, total_amount, fee_amount, shipping_cost, created_at, listing_title, listing:listings(title)")
      .eq("seller_id", user.id)
      .eq("status", "PAID")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const movements = (sales ?? []) as TransactionRow[];

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="-ml-2 h-9 w-9">
          <Link href="/profile" aria-label="Retour">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Mon porte-monnaie</h1>
      </div>
      <div className="rounded-xl border p-5 text-center">
        <p className="text-3xl font-semibold tracking-tight">
          {wallet?.available_balance?.toFixed(2) ?? "0.00"} €
        </p>
        <p className="text-muted-foreground mt-1 text-xs">Montant disponible</p>
        <p className="text-muted-foreground mt-3 text-xs">
          En attente: {wallet?.pending_balance?.toFixed(2) ?? "0.00"} {wallet?.currency ?? "EUR"}
        </p>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold">Historique des mouvements</p>
        {movements.length === 0 ? (
          <p className="text-muted-foreground text-sm">Aucun mouvement pour le moment.</p>
        ) : (
          <div className="divide-border/60 divide-y">
            {movements.map((tx) => {
              const net = Math.max(0, Number(tx.total_amount) - Number(tx.fee_amount) - Number(tx.shipping_cost));
              return (
                <div key={tx.id} className="flex items-center justify-between gap-3 py-3">
                  <p className="text-muted-foreground line-clamp-1 text-xs">
                    Vente - {tx.listing_title ?? pickOne(tx.listing)?.title ?? "Annonce"} - {formatDate(tx.created_at)}
                  </p>
                  <p className="text-sm font-medium">+{net.toFixed(2)} €</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Button asChild className="w-full">
        <Link href="/wallet">Transferer</Link>
      </Button>
    </section>
  );
}
