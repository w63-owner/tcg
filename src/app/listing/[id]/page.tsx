import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { ListingImageCarousel } from "@/components/listing/listing-image-carousel";
import { OfferModal } from "./offer-modal";
import { startCheckoutAction } from "./actions";
import {
  addFavoriteListing,
  addFavoriteSeller,
  removeFavoriteListing,
  removeFavoriteSeller,
} from "@/app/favorites/actions";
import { createConversationForListingAction } from "@/app/messages/actions";
import { calculateDisplayPrice } from "@/lib/pricing";

type ListingDetailsRow = {
  id: string;
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
      "id, title, seller_id, price_seller, display_price, condition, is_graded, grading_company, grade_note, status, cover_image_url, back_image_url, created_at",
    )
    .eq("id", id)
    .single<ListingDetailsRow>();

  if (error || !listing) {
    notFound();
  }

  const displayPrice =
    listing.display_price ?? calculateDisplayPrice(Number(listing.price_seller));
  const minimumOffer = Math.round(displayPrice * 0.7 * 100) / 100;
  const canBuy = listing.status === "ACTIVE" && user && user.id !== listing.seller_id;
  const canOffer = canBuy;

  let isListingFavorite = false;
  let isSellerFavorite = false;
  if (user) {
    const [{ data: favListing }, { data: favSeller }] = await Promise.all([
      supabase
        .from("favorite_listings")
        .select("listing_id")
        .eq("user_id", user.id)
        .eq("listing_id", listing.id)
        .maybeSingle<{ listing_id: string }>(),
      supabase
        .from("favorite_sellers")
        .select("seller_id")
        .eq("user_id", user.id)
        .eq("seller_id", listing.seller_id)
        .maybeSingle<{ seller_id: string }>(),
    ]);
    isListingFavorite = Boolean(favListing);
    isSellerFavorite = Boolean(favSeller);
  }

  return (
    <section className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        <Button asChild variant="ghost" size="sm" className="pl-0">
          <Link href={backHref}>Retour aux resultats</Link>
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
            <p>
              <span className="font-medium">Offre min:</span>{" "}
              {toEuro(minimumOffer)}
            </p>
          </div>

          <form action={startCheckoutAction} className="space-y-2">
            <input type="hidden" name="listing_id" value={listing.id} />
            <Button type="submit" className="w-full" disabled={!canBuy}>
              Acheter
            </Button>
          </form>

          <OfferModal
            listingId={listing.id}
            defaultOfferAmount={minimumOffer}
            canOffer={Boolean(canOffer)}
          />

          {user && user.id !== listing.seller_id ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <form action={isListingFavorite ? removeFavoriteListing : addFavoriteListing}>
                <input type="hidden" name="listing_id" value={listing.id} />
                <Button type="submit" variant="outline" className="w-full">
                  {isListingFavorite
                    ? "Retirer des favoris"
                    : "Ajouter annonce aux favoris"}
                </Button>
              </form>
              <form action={isSellerFavorite ? removeFavoriteSeller : addFavoriteSeller}>
                <input type="hidden" name="seller_id" value={listing.seller_id} />
                <Button type="submit" variant="outline" className="w-full">
                  {isSellerFavorite
                    ? "Retirer vendeur favori"
                    : "Ajouter vendeur favori"}
                </Button>
              </form>
            </div>
          ) : null}

          {user && user.id !== listing.seller_id ? (
            <form action={createConversationForListingAction}>
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
  );
}
