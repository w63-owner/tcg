import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/server";
import { formatTransactionStatusLabel } from "@/lib/listings/status-label";

type TransactionRow = {
  id: string;
  total_amount: number;
  status: "PENDING_PAYMENT" | "PAID" | "CANCELLED" | "EXPIRED" | "REFUNDED" | "SHIPPED";
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

export default async function ProfileTransactionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const [{ data: purchases }, { data: sales }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, total_amount, status, created_at, listing_title, listing:listings(title)")
      .eq("buyer_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("transactions")
      .select("id, total_amount, status, created_at, listing_title, listing:listings(title)")
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const myPurchases = (purchases ?? []) as TransactionRow[];
  const mySales = (sales ?? []) as TransactionRow[];

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="-ml-2 h-9 w-9">
          <Link href="/profile" aria-label="Retour">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Transactions</h1>
      </div>
      <Tabs defaultValue="purchases">
        <TabsList variant="line" className="grid w-full grid-cols-2">
          <TabsTrigger value="purchases">Achats</TabsTrigger>
          <TabsTrigger value="sales">Ventes</TabsTrigger>
        </TabsList>
        <TabsContent value="purchases" className="mt-3">
          {myPurchases.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucun achat pour le moment.</p>
          ) : (
            <div className="divide-border/60 divide-y">
              {myPurchases.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="line-clamp-1 text-sm font-medium">{tx.listing_title ?? pickOne(tx.listing)?.title ?? "Annonce"}</p>
                    <p className="text-muted-foreground text-xs">{formatDate(tx.created_at)} · {formatTransactionStatusLabel(tx.status)}</p>
                  </div>
                  <p className="shrink-0 text-sm font-medium">{tx.total_amount.toFixed(2)} €</p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="sales" className="mt-3">
          {mySales.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aucune vente pour le moment.</p>
          ) : (
            <div className="divide-border/60 divide-y">
              {mySales.map((tx) => (
                <Link
                  key={tx.id}
                  href={`/profile/sales/${tx.id}`}
                  className="hover:bg-muted/50 flex items-center justify-between gap-3 py-3 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-medium">{tx.listing_title ?? pickOne(tx.listing)?.title ?? "Annonce"}</p>
                    <p className="text-muted-foreground text-xs">{formatDate(tx.created_at)} · {formatTransactionStatusLabel(tx.status)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <p className="text-sm font-medium">{tx.total_amount.toFixed(2)} €</p>
                    <ChevronRight className="text-muted-foreground h-4 w-4" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
