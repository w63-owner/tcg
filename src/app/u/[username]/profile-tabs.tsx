"use client";

import Link from "next/link";
import Image from "next/image";
import { MapPin, Calendar, Star, Instagram, Facebook } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const COUNTRY_LABELS: Record<string, string> = {
  FR: "France",
  BE: "Belgique",
  LU: "Luxembourg",
  CH: "Suisse",
  DE: "Allemagne",
  ES: "Espagne",
  IT: "Italie",
  PT: "Portugal",
  NL: "Pays-Bas",
  AT: "Autriche",
  GB: "Royaume-Uni",
};

type Listing = {
  id: string;
  title: string;
  cover_image_url: string | null;
  display_price: number | null;
};

export type ProfileReview = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer_username: string;
};

type ProfileTabsProps = {
  username: string;
  avatarUrl: string | null;
  countryCode: string;
  createdAt: string;
  bio?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  tiktokUrl?: string | null;
  listings: Listing[];
  reviews: ProfileReview[];
};

function formatMemberSince(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Membre récent";
  return `Membre depuis ${date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`;
}

function formatReviewDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.floor(diffMs / 3600_000);
  const diffDays = Math.floor(diffHours / 24);
  if (diffHours < 1) return "À l'instant";
  if (diffHours < 24) return `Il y a ${diffHours} h`;
  if (diffDays < 30) return `Il y a ${diffDays} jour${diffDays > 1 ? "s" : ""}`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5 text-amber-500" aria-label={`${rating} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`size-4 shrink-0 ${i <= rating ? "fill-amber-500" : "fill-transparent"}`}
        />
      ))}
    </span>
  );
}

const TIKTOK_SVG = (
  <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="currentColor" aria-hidden>
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
  </svg>
);

export function ProfileTabs({
  username,
  avatarUrl,
  countryCode,
  createdAt,
  bio,
  instagramUrl,
  facebookUrl,
  tiktokUrl,
  listings,
  reviews,
}: ProfileTabsProps) {
  const initial = (username || "U").slice(0, 1).toUpperCase();
  const countryLabel = COUNTRY_LABELS[countryCode] ?? countryCode;

  return (
    <Tabs defaultValue="annonces" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="annonces">Annonces</TabsTrigger>
        <TabsTrigger value="evaluations">Évaluations</TabsTrigger>
        <TabsTrigger value="apropos">À propos</TabsTrigger>
      </TabsList>

      <TabsContent value="annonces" className="mt-4">
        {listings.length > 0 ? (
          <>
            <div className="text-muted-foreground mb-3 flex items-center justify-between text-sm">
              <span className="font-medium">
                {listings.length} article{listings.length > 1 ? "s" : ""}
              </span>
            </div>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {listings.map((listing) => (
                <li key={listing.id}>
                  <Link
                    href={`/listing/${listing.id}`}
                    className="bg-muted/50 hover:bg-muted flex flex-col overflow-hidden rounded-lg border transition-colors"
                  >
                    <div className="bg-muted relative aspect-[63/88] w-full">
                      {listing.cover_image_url ? (
                        <Image
                          src={listing.cover_image_url}
                          alt={listing.title}
                          fill
                          sizes="(max-width: 640px) 50vw, 33vw"
                          className="object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 p-2">
                      <p className="line-clamp-2 text-sm font-medium">{listing.title}</p>
                      <p className="text-muted-foreground text-xs">
                        {listing.display_price != null
                          ? `${Number(listing.display_price).toFixed(2)} €`
                          : "—"}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-muted-foreground py-8 text-center text-sm">
            Aucune annonce en vente pour le moment.
          </p>
        )}
      </TabsContent>

      <TabsContent value="evaluations" className="mt-4">
        {reviews.length > 0 ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-1 border-b pb-4">
              <span className="text-3xl font-semibold">
                {(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)}
              </span>
              <Stars rating={Math.round(reviews.reduce((s, r) => s + r.rating, 0) / reviews.length)} />
              <span className="text-muted-foreground text-sm">({reviews.length} évaluation{reviews.length > 1 ? "s" : ""})</span>
            </div>
            <ul className="space-y-4">
              {reviews.map((review) => (
                <li key={review.id} className="border-b pb-4 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{review.reviewer_username}</span>
                    <span className="text-muted-foreground text-xs">{formatReviewDate(review.created_at)}</span>
                  </div>
                  <div className="mt-1">
                    <Stars rating={review.rating} />
                  </div>
                  {review.comment ? (
                    <p className="text-muted-foreground mt-2 text-sm">{review.comment}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-muted-foreground py-8 text-center text-sm">
            Aucune évaluation pour le moment.
          </p>
        )}
      </TabsContent>

      <TabsContent value="apropos" className="mt-4">
        <div className="flex flex-col items-center border-b pb-6">
          <div className="bg-muted relative h-24 w-24 shrink-0 overflow-hidden rounded-full border">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={username}
                fill
                sizes="96px"
                className="object-cover"
              />
            ) : (
              <div className="text-muted-foreground flex h-full items-center justify-center text-3xl font-semibold">
                {initial}
              </div>
            )}
          </div>
          <p className="mt-4 text-xl font-semibold">{username}</p>
        </div>
        <div className="space-y-3 pt-2">
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <MapPin className="size-4 shrink-0" />
            <span>{countryLabel}</span>
          </div>
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <Calendar className="size-4 shrink-0" />
            <span>{formatMemberSince(createdAt)}</span>
          </div>
          {bio?.trim() ? (
            <p className="text-muted-foreground pt-2 text-sm whitespace-pre-wrap">{bio.trim()}</p>
          ) : null}
          {(instagramUrl?.trim() || facebookUrl?.trim() || tiktokUrl?.trim()) ? (
            <div className="flex flex-wrap gap-3 pt-3">
              {instagramUrl?.trim() ? (
                <a
                  href={instagramUrl.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
                  aria-label="Instagram"
                >
                  <Instagram className="size-4" />
                  Instagram
                </a>
              ) : null}
              {facebookUrl?.trim() ? (
                <a
                  href={facebookUrl.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
                  aria-label="Facebook"
                >
                  <Facebook className="size-4" />
                  Facebook
                </a>
              ) : null}
              {tiktokUrl?.trim() ? (
                <a
                  href={tiktokUrl.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
                  aria-label="TikTok"
                >
                  {TIKTOK_SVG}
                  TikTok
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </TabsContent>
    </Tabs>
  );
}
