import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { ListingImageCarousel } from "@/components/listing/listing-image-carousel";
import { PriceHistoryCard } from "@/components/listing/price-history-card";
import { startCheckoutAction } from "./actions";
import { createConversationForListingAction } from "@/app/messages/actions";
import { calculateDisplayPrice } from "@/lib/pricing";

type ListingDetailsRow = {
  id: string;
  card_ref_id: string | null;
  title: string;
  seller_id: string;
  price_seller: number;
  display_price: number | null;
  condition: string | null;
  is_graded: boolean;
  grading_company: string | null;
  grade_note: number | null;
  status: "DRAFT" | "ACTIVE" | "LOCKED" | "SOLD";
  cover_image_url: string | null;
  back_image_url: string | null;
  created_at: string;
};

function toEuro(amount: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

type ListingPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; checkout?: string; from?: string }>;
};

export default async function ListingPage({
  params,
  searchParams,
}: ListingPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const backHref =
    query.from && query.from.startsWith("/") ? query.from : "/";
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: listing, error } = await supabase
    .from("listings")
    .select(
      "id, card_ref_id, title, seller_id, price_seller, display_price, condition, is_graded, grading_company, grade_note, status, cover_image_url, back_image_url, created_at",
    )
    .eq("id", id)
    .single<ListingDetailsRow>();

  if (error || !listing) {
    notFound();
  }

  let priceHistory: Array<{ date: string; price: number }> = [];
  if (listing.card_ref_id) {
    const { data: historyRows } = await supabase
      .from("listings")
      .select("created_at, display_price, price_seller")
      .eq("card_ref_id", listing.card_ref_id)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: true })
      .limit(240);

    priceHistory = (historyRows ?? [])
      .map((row) => ({
        date: row.created_at as string,
        price: Number(row.display_price ?? calculateDisplayPrice(Number(row.price_seller))),
      }))
      .filter((row) => Number.isFinite(row.price) && row.price > 0);
  }

  if (priceHistory.length === 0) {
    priceHistory = [
      {
        date: listing.created_at,
        price: Number(listing.display_price ?? calculateDisplayPrice(Number(listing.price_seller))),
      },
    ];
  }

  const displayPrice =
    listing.display_price ?? calculateDisplayPrice(Number(listing.price_seller));
  const canBuy = listing.status === "ACTIVE" && user && user.id !== listing.seller_id;

  return (
    <div className="space-y-4">
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <Button asChild variant="ghost" size="icon" className="-ml-2 h-9 w-9">
            <Link href={backHref} aria-label="Retour aux resultats">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Card className="overflow-hidden py-0">
            <ListingImageCarousel
              images={[
                listing.cover_image_url
                  ? { src: listing.cover_image_url, alt: `${listing.title} recto` }
                  : null,
                listing.back_image_url
                  ? { src: listing.back_image_url, alt: `${listing.title} verso` }
                  : null,
              ]}
            />
          </Card>
        </div>

        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader className="space-y-3">
            <Badge variant={listing.status === "ACTIVE" ? "secondary" : "outline"}>
              {listing.status}
            </Badge>
            <CardTitle>{listing.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
          <div>
            <p className="text-2xl font-semibold">{toEuro(displayPrice)}</p>
            <p className="text-muted-foreground text-xs">
              Hors frais de port (calcules au checkout).
            </p>
          </div>

          <div className="space-y-1 text-sm">
            <p>
              <span className="font-medium">Prix vendeur:</span>{" "}
              {toEuro(Number(listing.price_seller))}
            </p>
            {listing.is_graded ? (
              <p>
                <span className="font-medium">Gradation:</span>{" "}
                {listing.grading_company} - Note {listing.grade_note}
              </p>
            ) : (
              <p>
                <span className="font-medium">Etat:</span> {listing.condition}
              </p>
            )}
          </div>

          <form action={startCheckoutAction} className="hidden space-y-2 md:block">
            <input type="hidden" name="listing_id" value={listing.id} />
            <Button type="submit" className="w-full" disabled={!canBuy}>
              Acheter
            </Button>
          </form>

          {user && user.id !== listing.seller_id ? (
            <form action={createConversationForListingAction} className="hidden md:block">
              <input type="hidden" name="listing_id" value={listing.id} />
              <Button type="submit" variant="secondary" className="w-full">
                Contacter le vendeur
              </Button>
            </form>
          ) : null}

          {!user ? (
            <p className="text-sm">
              Connecte-toi pour acheter ou negocier.{" "}
              <Link href={`/auth?next=/listing/${listing.id}`} className="underline">
                Se connecter
              </Link>
            </p>
          ) : null}

          {query.checkout === "cancelled" ? (
            <p className="text-destructive text-sm">
              Paiement annule. Tu peux reessayer quand tu veux.
            </p>
          ) : null}
            {query.error ? (
              <p className="text-destructive text-sm">
                Action impossible: {query.error}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <PriceHistoryCard observations={priceHistory} />

      {user && user.id !== listing.seller_id ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 pt-2 pb-[max(0.75rem,var(--safe-area-bottom))] backdrop-blur md:hidden">
          <div className="grid grid-cols-2 gap-2">
            <form action={createConversationForListingAction}>
              <input type="hidden" name="listing_id" value={listing.id} />
              <Button type="submit" variant="secondary" className="h-11 w-full shadow-lg">
                Contacter
              </Button>
            </form>
            <form action={startCheckoutAction}>
              <input type="hidden" name="listing_id" value={listing.id} />
              <Button type="submit" className="h-11 w-full shadow-lg" disabled={!canBuy}>
                Acheter
              </Button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
