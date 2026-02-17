import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { ListingImageCarousel } from "@/components/listing/listing-image-carousel";
import { ListingMediaActions } from "@/components/listing/listing-media-actions";
import { PriceHistoryCard } from "@/components/listing/price-history-card";
import { startCheckoutAction } from "./actions";
import { createConversationForListingAction } from "@/app/messages/actions";
import { calculateDisplayPrice } from "@/lib/pricing";
import { formatConditionLabel } from "@/lib/listings/condition-label";

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

type CardRefDetailsRow = {
  id: string;
  name: string;
  set_id: string | null;
  tcg_id: string | null;
  card_number: string | null;
  language: string | null;
  hp: number | null;
  rarity: string | null;
  finish: string | null;
  is_secret: boolean | null;
  is_promo: boolean | null;
  vintage_hint: string | null;
  regulation_mark: string | null;
  illustrator: string | null;
  estimated_condition: string | null;
  release_year: number | null;
};

const SET_CODE_LABELS: Record<string, string> = {
  BASE1: "Set de Base",
  BASE2: "Jungle",
  BASE3: "Fossile",
  BASE4: "Base Set 2",
  BASE5: "Team Rocket",
  BASEP: "Promos Set de Base",
};

function toEuro(amount: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

function formatPostedSince(value: string) {
  const createdAt = new Date(value);
  if (Number.isNaN(createdAt.getTime())) return "Date inconnue";
  const diffMs = Date.now() - createdAt.getTime();
  const diffHours = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
  if (diffHours < 1) return "il y a moins d'une heure";
  if (diffHours < 24) return `il y a ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `il y a ${diffDays} jour${diffDays > 1 ? "s" : ""}`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `il y a ${diffMonths} mois`;
  const diffYears = Math.floor(diffDays / 365);
  return `il y a ${diffYears} an${diffYears > 1 ? "s" : ""}`;
}

function formatSetLabel(setValue?: string | null) {
  const raw = String(setValue ?? "").trim();
  if (!raw) return "-";
  const upper = raw.toUpperCase();
  if (SET_CODE_LABELS[upper]) return SET_CODE_LABELS[upper];
  if (upper.startsWith("EXP-")) return `Extension ${upper.replace("EXP-", "")}`;
  return raw
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatFinishLabel(value?: string | null) {
  const upper = String(value ?? "").trim().toUpperCase();
  if (!upper) return "-";
  const labels: Record<string, string> = {
    NON_HOLO: "Non holo",
    HOLO: "Holo",
    REVERSE_HOLO: "Holo reverse",
    FULL_ART: "Illustration complete",
    TEXTURED: "Texturee",
    COSMOS: "Cosmos",
    CRACKED_ICE: "Cracked ice",
  };
  return labels[upper] ?? upper.replace(/_/g, " ");
}

function formatRarityLabel(value?: string | null) {
  const upper = String(value ?? "").trim().toUpperCase();
  if (!upper) return "-";
  const labels: Record<string, string> = {
    COMMON: "Commune",
    UNCOMMON: "Peu commune",
    RARE: "Rare",
    HOLO_RARE: "Rare holo",
    ULTRA_RARE: "Ultra rare",
    SECRET_RARE: "Secrete rare",
    PROMO: "Promo",
  };
  return (
    labels[upper] ??
    upper
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

function formatConditionUserLabel(value?: string | null) {
  const upper = String(value ?? "").trim().toUpperCase();
  if (!upper) return "-";
  const labels: Record<string, string> = {
    MINT: "Neuf",
    NEAR_MINT: "Quasi neuf",
    EXCELLENT: "Excellent",
    GOOD: "Bon",
    LIGHT_PLAYED: "Legerement joue",
    PLAYED: "Joue",
    POOR: "Abime",
  };
  return labels[upper] ?? formatConditionLabel(upper);
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

  let favoriteCount = 0;
  let initialFavorite = false;
  const { data: favoriteRows } = await supabase
    .from("favorite_listings")
    .select("listing_id")
    .eq("listing_id", listing.id);
  favoriteCount = (favoriteRows ?? []).length;
  if (user) {
    const { data: likedRow } = await supabase
      .from("favorite_listings")
      .select("listing_id")
      .eq("listing_id", listing.id)
      .eq("user_id", user.id)
      .maybeSingle();
    initialFavorite = Boolean(likedRow);
  }

  let cardRef: CardRefDetailsRow | null = null;
  if (listing.card_ref_id) {
    const { data: cardRefRow } = await supabase
      .from("cards_ref")
      .select(
        "id, name, set_id, tcg_id, card_number, language, hp, rarity, finish, is_secret, is_promo, vintage_hint, regulation_mark, illustrator, estimated_condition, release_year",
      )
      .eq("id", listing.card_ref_id)
      .maybeSingle<CardRefDetailsRow>();
    cardRef = cardRefRow ?? null;
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
  const isSeller = Boolean(user && user.id === listing.seller_id);
  const showMobileStickyActions = listing.status === "ACTIVE" && !isSeller;

  return (
    <div className="space-y-4">
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <Button asChild variant="ghost" size="icon" className="-ml-2 h-9 w-9">
              <Link href={backHref} aria-label="Retour aux resultats">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <ListingMediaActions
              listingId={listing.id}
              title={listing.title}
              favoriteCount={favoriteCount}
              initialFavorite={initialFavorite}
              canToggleFavorite={Boolean(user)}
            />
          </div>
          <div className="overflow-hidden">
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
          </div>
        </div>

        <aside className="h-fit space-y-5 lg:sticky lg:top-20">
          <section className="space-y-3 border-b pb-4">
            <h1 className="text-3xl font-bold tracking-tight">{listing.title}</h1>
            <div>
              <p className="text-2xl font-bold tracking-tight">{toEuro(displayPrice)}</p>
              <div className="text-muted-foreground mt-1 space-y-1 text-xs">
                <p>Hors frais de port. Livraison calculee au checkout.</p>
              </div>
            </div>
            <p className="text-sm">
              <span className="font-medium">Etat:</span>{" "}
              {listing.is_graded
                ? `Gradee (${listing.grading_company || "N/A"}${listing.grade_note ? ` ${listing.grade_note}` : ""})`
                : formatConditionUserLabel(listing.condition)}
            </p>
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
            <p className="text-muted-foreground text-xs">Publiee {formatPostedSince(listing.created_at)}</p>
          </section>

          <section className="space-y-2 border-b pb-4">
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Etat de la carte
            </p>
            <div className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
              {listing.is_graded ? (
                <>
                  <p>
                    <span className="font-medium">Mode:</span> Gradee
                  </p>
                  <p>
                    <span className="font-medium">Societe:</span> {listing.grading_company || "-"}
                  </p>
                  <p>
                    <span className="font-medium">Note:</span> {listing.grade_note ?? "-"}
                  </p>
                  <p>
                    <span className="font-medium">Etat estime:</span>{" "}
                    {cardRef ? formatConditionUserLabel(cardRef.estimated_condition) : "-"}
                  </p>
                </>
              ) : (
                <p>
                  <span className="font-medium">Etat:</span>{" "}
                  {formatConditionUserLabel(listing.condition)}
                </p>
              )}
            </div>
          </section>

          {cardRef ? (
            <>
              <section className="space-y-2 border-b pb-4">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Identification
                </p>
                <div className="grid grid-cols-1 gap-x-3 gap-y-1 text-sm sm:grid-cols-2">
                  <p>
                    <span className="font-medium">Set:</span> {formatSetLabel(cardRef.set_id)}
                  </p>
                  <p>
                    <span className="font-medium">Numero:</span> {cardRef.card_number || "-"}
                  </p>
                  <p>
                    <span className="font-medium">Langue:</span>{" "}
                    {cardRef.language ? cardRef.language.toUpperCase() : "-"}
                  </p>
                  <p>
                    <span className="font-medium">HP:</span> {cardRef.hp ?? "-"}
                  </p>
                  <p>
                    <span className="font-medium">Rarete:</span> {formatRarityLabel(cardRef.rarity)}
                  </p>
                  <p>
                    <span className="font-medium">Finition:</span> {formatFinishLabel(cardRef.finish)}
                  </p>
                </div>
              </section>

              <section className="space-y-2">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Details techniques
                </p>
                <div className="grid grid-cols-1 gap-x-3 gap-y-1 text-sm sm:grid-cols-2">
                  <p>
                    <span className="font-medium">Secret:</span>{" "}
                    {cardRef.is_secret === null ? "-" : cardRef.is_secret ? "Oui" : "Non"}
                  </p>
                  <p>
                    <span className="font-medium">Promo:</span>{" "}
                    {cardRef.is_promo === null ? "-" : cardRef.is_promo ? "Oui" : "Non"}
                  </p>
                  <p>
                    <span className="font-medium">Vintage:</span> {cardRef.vintage_hint || "-"}
                  </p>
                  <p>
                    <span className="font-medium">Regulation:</span> {cardRef.regulation_mark || "-"}
                  </p>
                  <p>
                    <span className="font-medium">Illustrateur:</span> {cardRef.illustrator || "-"}
                  </p>
                  <p>
                    <span className="font-medium">Annee:</span> {cardRef.release_year ?? "-"}
                  </p>
                  <p className="sm:col-span-2">
                    <span className="font-medium">Ref. collection:</span> {cardRef.tcg_id || cardRef.id}
                  </p>
                </div>
              </section>
            </>
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
        </aside>
      </section>

      <PriceHistoryCard observations={priceHistory} />

      {showMobileStickyActions ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 pt-2 pb-[max(0.75rem,var(--safe-area-bottom))] backdrop-blur md:hidden">
          <div className="grid grid-cols-2 gap-2">
            {user ? (
              <>
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
              </>
            ) : (
              <>
                <Button asChild variant="secondary" className="h-11 w-full shadow-lg">
                  <Link href={`/auth?next=/listing/${listing.id}`}>Se connecter</Link>
                </Button>
                <Button asChild className="h-11 w-full shadow-lg">
                  <Link href={`/auth?next=/listing/${listing.id}`}>Acheter</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
