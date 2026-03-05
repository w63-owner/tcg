import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { requireAuthenticatedUser } from "@/lib/auth/require-authenticated-user";
import {
  calculateDisplayPrice,
  calculateFeeAmount,
} from "@/lib/pricing";
import { resolveShippingCost } from "@/lib/shipping/calculate-cost";
import { CheckoutFormClient } from "./checkout-form-client";

type ListingRow = {
  id: string;
  title: string;
  seller_id: string;
  price_seller: number;
  display_price: number | null;
  delivery_weight_class: string;
  status: "DRAFT" | "ACTIVE" | "LOCKED" | "SOLD";
  cover_image_url: string | null;
};

type ProfileRow = {
  id: string;
  country_code: string;
};

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ listingId: string }>;
  searchParams: Promise<{ cancelled?: string }>;
}) {
  const { listingId } = await params;
  const { cancelled } = await searchParams;
  const supabase = await createClient();
  const { user } = await requireAuthenticatedUser(`/checkout/${listingId}`);

  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select(
      "id, title, seller_id, price_seller, display_price, delivery_weight_class, status, cover_image_url",
    )
    .eq("id", listingId)
    .single<ListingRow>();

  if (listingError || !listing) {
    notFound();
  }

  if (listing.seller_id === user.id) {
    notFound();
  }

  if (listing.status !== "ACTIVE") {
    notFound();
  }

  const { data: buyerProfile } = await supabase
    .from("profiles")
    .select("id, country_code")
    .eq("id", user.id)
    .single<ProfileRow>();

  const countryCode = buyerProfile?.country_code ?? "FR";
  const shippingCost = await resolveShippingCost({
    supabase,
    buyerId: user.id,
    sellerId: listing.seller_id,
    weightClass: listing.delivery_weight_class,
  });

  const displayPrice =
    listing.display_price ?? calculateDisplayPrice(Number(listing.price_seller));
  const feeAmount = calculateFeeAmount(displayPrice, Number(listing.price_seller));
  const totalAmount = Math.round((displayPrice + shippingCost) * 100) / 100;

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="-ml-2 h-9 w-9">
          <Link href={`/listing/${listing.id}`} aria-label="Retour à l'annonce">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Finaliser l&apos;achat</h1>
      </div>

      {cancelled === "1" && (
        <p className="text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm">
          Paiement annulé. Tu peux modifier ton adresse ou réessayer quand tu veux.
        </p>
      )}
      <CheckoutFormClient
        buyerId={user.id}
        listingId={listing.id}
        listingTitle={listing.title}
        coverImageUrl={listing.cover_image_url}
        displayPrice={displayPrice}
        feeAmount={feeAmount}
        initialShippingCost={shippingCost}
        initialCountryCode={countryCode}
        initialTotal={totalAmount}
      />
    </div>
  );
}
