import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, Clock, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { ListingImageCarousel } from "@/components/listing/listing-image-carousel";
import { ListingMediaActions } from "@/components/listing/listing-media-actions";
import { DeleteListingButton } from "@/components/listing/delete-listing-button";
import { PriceHistoryCard } from "@/components/listing/price-history-card";
import { updateListingPriceAction } from "./actions";
import { BuyButton } from "./buy-button";
import { ListingErrorToast } from "./listing-error-toast";
import { createConversationForListingAction } from "@/app/messages/actions";
import { calculateDisplayPrice } from "@/lib/pricing";
import { formatConditionLabel } from "@/lib/listings/condition-label";

type ListingDetailsRow = {
  id: string;
  card_ref_id: string | null;
  card_series: string | null;
  card_block: string | null;
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
  card_key: string;
  id: string;
  name: string;
  set_id: string | null;
  set_name: string | null;
  set_card_count_official: number | null;
  set_serie_name: string | null;
  local_id: string | null;
  language: string | null;
  rarity: string | null;
  suffix: string | null;
  regulation_mark: string | null;
  illustrator: string | null;
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

function formatCardNumber(localId?: string | null, officialCount?: number | null) {
  const local = String(localId ?? "").trim();
  if (!local) return "-";
  if (typeof officialCount === "number" && Number.isFinite(officialCount) && officialCount > 0) {
    return `${local}/${officialCount}`;
  }
  return local;
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
  searchParams: Promise<{
    error?: string;
    checkout?: string;
    from?: string;
    edit?: string;
    saved?: string;
  }>;
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
      "id, card_ref_id, card_series, card_block, title, seller_id, price_seller, display_price, condition, is_graded, grading_company, grade_note, status, cover_image_url, back_image_url, created_at",
    )
    .eq("id", id)
    .single<ListingDetailsRow>();

  if (error || !listing) {
    notFound();
  }

  let favoriteCount = 0;
  let initialFavorite = false;
  const [favoriteCountResult, likedResult, cardRefResult, historyResult, sellerDisplayResult] =
    await Promise.all([
      supabase.rpc("get_favorite_listing_counts", {
        listing_ids: [listing.id],
      }),
      user
        ? supabase
            .from("favorite_listings")
            .select("listing_id")
            .eq("listing_id", listing.id)
            .eq("user_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      listing.card_ref_id
        ? supabase
            .from("tcgdex_cards")
            .select(
              "card_key,id,name,set_id,set_name,set_card_count_official,set_serie_name,local_id,language,rarity,suffix,regulation_mark,illustrator",
            )
            .eq("card_key", listing.card_ref_id)
            .maybeSingle<CardRefDetailsRow>()
        : Promise.resolve({ data: null }),
      listing.card_ref_id
        ? supabase
            .from("listings")
            .select("created_at, display_price, price_seller")
            .eq("card_ref_id", listing.card_ref_id)
            .eq("status", "ACTIVE")
            .order("created_at", { ascending: true })
            .limit(240)
        : Promise.resolve({ data: [] as Array<{ created_at: string; display_price: number | null; price_seller: number }> }),
      supabase.rpc("get_listing_seller_display", { p_listing_id: listing.id }),
    ]);

  const favoriteCountRow = (favoriteCountResult.data ??
    []) as Array<{ listing_id: string; favorite_count: number }>;
  favoriteCount = Number(favoriteCountRow[0]?.favorite_count ?? 0);
  initialFavorite = Boolean(likedResult.data);
  const cardRef = (cardRefResult.data as CardRefDetailsRow | null) ?? null;
  type SellerDisplayRow = {
    id: string;
    username: string;
    avatar_url: string | null;
    review_count: number;
    rating_avg: number;
    updated_at: string;
  };
  const sellerDisplay = (sellerDisplayResult.data as SellerDisplayRow[] | null)?.[0] ?? null;

  let priceHistory: Array<{ date: string; price: number }> = (historyResult.data ?? [])
    .map((row) => ({
      date: row.created_at as string,
      price: Number(row.display_price ?? calculateDisplayPrice(Number(row.price_seller))),
    }))
    .filter((row) => Number.isFinite(row.price) && row.price > 0);

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
  const showMobileStickySellerActions = isSeller && ["ACTIVE", "DRAFT"].includes(listing.status);
  const isEditMode = query.edit === "1" && isSeller;

  const showSoldBanner = listing.status === "SOLD";

  return (
    <div className={`space-y-4 ${showSoldBanner ? "pb-14" : ""}`}>
      <ListingErrorToast errorCode={query.error} />
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
          <div className="mx-auto w-1/2 overflow-hidden">
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

        <aside className="h-fit space-y-4 lg:sticky lg:top-20">
          {isEditMode ? (
            <section className="space-y-2 rounded-md border p-3">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Modifier l&apos;annonce
              </p>
              <form action={updateListingPriceAction} className="space-y-2">
                <input type="hidden" name="listing_id" value={listing.id} />
                <label className="space-y-1">
                  <span className="text-muted-foreground block text-xs">Prix net vendeur (EUR)</span>
                  <input
                    name="price_seller"
                    type="number"
                    min="0.01"
                    step="0.01"
                    defaultValue={Number(listing.price_seller).toFixed(2)}
                    className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm outline-none"
                    required
                  />
                </label>
                <Button type="submit" className="w-full">
                  Enregistrer
                </Button>
              </form>
            </section>
          ) : null}

          <section className="space-y-3 border-b pb-4">
            <h1 className="text-2xl font-semibold tracking-tight">{listing.title}</h1>
            <div>
              <p className="text-2xl font-semibold tracking-tight">{toEuro(displayPrice)}</p>
              <div className="text-muted-foreground mt-1 space-y-1 text-xs">
                <p>Hors frais de port. Livraison calculee au checkout.</p>
              </div>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Etat</p>
              <p className="text-sm">
                {listing.is_graded
                  ? `Gradee (${listing.grading_company || "N/A"}${listing.grade_note ? ` ${listing.grade_note}` : ""})`
                  : formatConditionUserLabel(listing.condition)}
              </p>
            </div>
            <div className="hidden md:block">
              <BuyButton listingId={listing.id} disabled={!canBuy} className="w-full" />
            </div>
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

          {sellerDisplay ? (
            <section className="space-y-3 border-b pb-4">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                Auteur de l&apos;annonce
              </p>
              <Link
                href={`/u/${encodeURIComponent(sellerDisplay.username)}`}
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/50"
              >
                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border bg-muted">
                  {sellerDisplay.avatar_url ? (
                    <Image
                      src={sellerDisplay.avatar_url}
                      alt=""
                      fill
                      sizes="48px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center text-lg font-medium text-muted-foreground">
                      {(sellerDisplay.username || "U").slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{sellerDisplay.username}</p>
                  <div className="mt-1 flex items-center gap-2 text-muted-foreground">
                    <span className="inline-flex gap-0.5 text-amber-500" aria-label={`${Number(sellerDisplay.rating_avg)} sur 5`}>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star
                          key={i}
                          className={`size-4 shrink-0 ${i <= Math.round(Number(sellerDisplay.rating_avg)) ? "fill-amber-500" : "fill-transparent"}`}
                        />
                      ))}
                    </span>
                    <span className="text-xs">
                      {Number(sellerDisplay.review_count)} avis
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="size-3.5 shrink-0" />
                    <span>Vu la derniere fois : {formatPostedSince(sellerDisplay.updated_at)}</span>
                  </div>
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            </section>
          ) : null}

          <section className="space-y-2 border-b pb-4">
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              Etat de la carte
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {listing.is_graded ? (
                <>
                  <div>
                    <p className="text-muted-foreground text-xs">Mode</p>
                    <p className="text-sm">Gradee</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Societe</p>
                    <p className="text-sm">{listing.grading_company || "-"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Note</p>
                    <p className="text-sm">{listing.grade_note ?? "-"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Etat estime</p>
                    <p className="text-sm">
                      -
                    </p>
                  </div>
                </>
              ) : (
                <div>
                  <p className="text-muted-foreground text-xs">Etat</p>
                  <p className="text-sm">{formatConditionUserLabel(listing.condition)}</p>
                </div>
              )}
            </div>
          </section>

          {cardRef ? (
            <>
              <section className="space-y-2 border-b pb-4">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Identification
                </p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  <div>
                    <p className="text-muted-foreground text-xs">Série</p>
                    <p className="text-sm">
                      {cardRef.set_name || listing.card_series || formatSetLabel(cardRef.set_id)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Numero</p>
                    <p className="text-sm">
                      {formatCardNumber(cardRef.local_id, cardRef.set_card_count_official)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Bloc</p>
                    <p className="text-sm">
                      {cardRef.set_serie_name || listing.card_block || "-"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Langue</p>
                    <p className="text-sm">{cardRef.language ? cardRef.language.toUpperCase() : "-"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Rarete</p>
                    <p className="text-sm">{formatRarityLabel(cardRef.rarity)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Finition</p>
                    <p className="text-sm">{formatFinishLabel(cardRef.suffix)}</p>
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Details techniques
                </p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  <div>
                    <p className="text-muted-foreground text-xs">Regulation</p>
                    <p className="text-sm">{cardRef.regulation_mark || "-"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Illustrateur</p>
                    <p className="text-sm">{cardRef.illustrator || "-"}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs">Ref. collection</p>
                    <p className="text-sm">{cardRef.id}</p>
                  </div>
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
          {query.saved === "1" ? (
            <p className="text-primary text-sm">Annonce mise a jour.</p>
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
                  <Button type="submit" variant="secondary" className="h-12 w-full">
                    Contacter
                  </Button>
                </form>
                <BuyButton
                  listingId={listing.id}
                  disabled={!canBuy}
                  className="h-12 w-full"
                />
              </>
            ) : (
              <>
                <Button asChild variant="secondary" className="h-12 w-full">
                  <Link href={`/auth?next=/listing/${listing.id}`}>Se connecter</Link>
                </Button>
                <Button asChild className="h-12 w-full">
                  <Link href={`/auth?next=/listing/${listing.id}`}>Acheter</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      ) : null}

      {showMobileStickySellerActions ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 pt-2 pb-[max(0.75rem,var(--safe-area-bottom))] backdrop-blur md:hidden">
          <div className="grid grid-cols-2 gap-2">
            <Button asChild variant="secondary" className="h-12 w-full">
              <Link href={`/listing/${listing.id}?edit=1`}>Modifier</Link>
            </Button>
            <DeleteListingButton listingId={listing.id} />
          </div>
        </div>
      ) : null}

      {showSoldBanner ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-amber-200 bg-amber-50/95 px-4 py-3 pb-[max(0.75rem,var(--safe-area-bottom))] backdrop-blur dark:border-amber-800 dark:bg-amber-950/95">
          <p className="text-center text-sm font-semibold text-amber-800 dark:text-amber-200">
            Vendu
          </p>
        </div>
      ) : null}
    </div>
  );
}
