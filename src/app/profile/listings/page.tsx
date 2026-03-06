import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { formatListingStatusLabel } from "@/lib/listings/status-label";

type ListingRow = {
  id: string;
  title: string;
  display_price: number | null;
  status: "DRAFT" | "ACTIVE" | "LOCKED" | "SOLD";
};

export default async function ProfileListingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data } = await supabase
    .from("listings")
    .select("id, title, display_price, status")
    .eq("seller_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const listings = (data ?? []) as ListingRow[];

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="-ml-2 h-9 w-9">
          <Link href="/profile" aria-label="Retour">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Mes annonces</h1>
      </div>
      {listings.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucune annonce publiee.</p>
      ) : (
        <div className="divide-border/60 divide-y">
          {listings.map((listing) => (
            <Link
              key={listing.id}
              href={`/listing/${listing.id}`}
              className="hover:bg-muted/30 flex items-center justify-between gap-3 py-3 transition-colors"
            >
              <div className="min-w-0">
                <p className="line-clamp-1 text-sm font-medium">{listing.title}</p>
                <p className="text-muted-foreground text-xs">
                  {listing.display_price?.toFixed(2) ?? "--.--"} € · {formatListingStatusLabel(listing.status)}
                </p>
              </div>
              <ChevronRight className="text-muted-foreground h-4 w-4 shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
