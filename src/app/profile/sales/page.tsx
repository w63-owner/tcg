import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";

type TransactionStatus =
  | "PENDING_PAYMENT"
  | "PAID"
  | "CANCELLED"
  | "EXPIRED"
  | "REFUNDED"
  | "SHIPPED";

type SaleRow = {
  id: string;
  total_amount: number;
  status: TransactionStatus;
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

function StatusBadge({ status }: { status: TransactionStatus }) {
  if (status === "PAID") {
    return (
      <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-400">
        À expédier
      </Badge>
    );
  }
  if (status === "SHIPPED") {
    return (
      <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
        Expédié
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="capitalize">
      {status.replace("_", " ").toLowerCase()}
    </Badge>
  );
}

export default async function ProfileSalesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: sales } = await supabase
    .from("transactions")
    .select("id, total_amount, status, created_at, listing_title, listing:listings(title)")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const mySales = (sales ?? []) as SaleRow[];

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="-ml-2 h-9 w-9">
          <Link href="/profile" aria-label="Retour">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Mes ventes</h1>
      </div>
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
                <p className="line-clamp-1 text-sm font-medium">
                  {tx.listing_title ?? pickOne(tx.listing)?.title ?? "Annonce"}
                </p>
                <p className="text-muted-foreground text-xs">
                  {formatDate(tx.created_at)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge status={tx.status} />
                <p className="text-sm font-medium">{Number(tx.total_amount).toFixed(2)} €</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
