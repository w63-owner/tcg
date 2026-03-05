import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { ShippingModalTrigger } from "../shipping-modal-client";

type TransactionStatus =
  | "PENDING_PAYMENT"
  | "PAID"
  | "CANCELLED"
  | "EXPIRED"
  | "REFUNDED"
  | "SHIPPED";

type SaleDetailRow = {
  id: string;
  total_amount: number;
  status: TransactionStatus;
  created_at: string;
  tracking_number: string | null;
  tracking_url: string | null;
  shipped_at: string | null;
  shipping_address_line: string | null;
  shipping_address_city: string | null;
  shipping_address_postcode: string | null;
  listing_title: string | null;
  listing: {
    id: string;
    title: string;
    cover_image_url: string | null;
  } | Array<{
    id: string;
    title: string;
    cover_image_url: string | null;
  }> | null;
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

function formatShippedDate(value: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleDateString("fr-FR");
}

export default async function ProfileSaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const { data: tx, error } = await supabase
    .from("transactions")
    .select(
      "id, total_amount, status, created_at, tracking_number, tracking_url, shipped_at, shipping_address_line, shipping_address_city, shipping_address_postcode, listing_title, listing:listings(id, title, cover_image_url)",
    )
    .eq("id", id)
    .eq("seller_id", user.id)
    .maybeSingle<SaleDetailRow>();

  if (error || !tx) {
    notFound();
  }

  const listing = pickOne(tx.listing);
  const listingTitle = tx.listing_title ?? listing?.title ?? "Annonce";
  const isPaid = tx.status === "PAID";
  const isShipped = tx.status === "SHIPPED";

  const addressParts = [
    tx.shipping_address_line,
    [tx.shipping_address_postcode, tx.shipping_address_city].filter(Boolean).join(" "),
  ].filter(Boolean);
  const addressFormatted = addressParts.length > 0 ? addressParts.join(", ") : null;

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="-ml-2 h-9 w-9">
          <Link href="/profile/sales" aria-label="Retour aux ventes">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Détail de la vente</h1>
      </div>

      <div className="space-y-4">
        <div className="flex items-start gap-4 rounded-lg border p-4">
          {listing?.cover_image_url ? (
            <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
              <Image
                src={listing.cover_image_url}
                alt={listing.title ?? "Carte"}
                fill
                className="object-cover"
                sizes="56px"
              />
            </div>
          ) : (
            <div className="bg-muted flex h-20 w-14 shrink-0 items-center justify-center rounded-md text-xs text-muted-foreground">
              Carte
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-medium">{listingTitle}</p>
            <p className="text-muted-foreground text-sm">
              {formatDate(tx.created_at)} · {Number(tx.total_amount).toFixed(2)} €
            </p>
            <div className="mt-2">
              {isPaid && (
                <Badge variant="secondary" className="bg-amber-500/15 text-amber-700 dark:text-amber-400">
                  À expédier
                </Badge>
              )}
              {isShipped && (
                <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                  Expédié
                </Badge>
              )}
              {!isPaid && !isShipped && (
                <Badge variant="outline" className="capitalize">
                  {tx.status.replace("_", " ").toLowerCase()}
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <h2 className="text-muted-foreground mb-2 text-sm font-medium">
            Adresse de livraison (acheteur)
          </h2>
          {addressFormatted ? (
            <p className="text-sm whitespace-pre-line">{addressFormatted}</p>
          ) : (
            <p className="text-muted-foreground text-sm">
              Adresse non renseignée. L&apos;acheteur peut la compléter dans son profil ou vous pouvez la lui demander via la messagerie.
            </p>
          )}
        </div>

        {isShipped && (tx.tracking_number || tx.tracking_url) && (
          <div className="rounded-lg border p-4">
            <h2 className="text-muted-foreground mb-2 text-sm font-medium">
              Suivi d&apos;expédition
            </h2>
            {tx.tracking_number && (
              <p className="text-sm">
                <span className="text-muted-foreground">N° de suivi :</span>{" "}
                {tx.tracking_number}
              </p>
            )}
            {tx.tracking_url && (
              <p className="mt-1">
                <a
                  href={tx.tracking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary text-sm underline"
                >
                  Lien de suivi
                </a>
              </p>
            )}
            {tx.shipped_at && (
              <p className="text-muted-foreground mt-1 text-xs">
                Expédié le {formatShippedDate(tx.shipped_at)}
              </p>
            )}
          </div>
        )}

        {isPaid && (
          <div className="pt-2">
            <ShippingModalTrigger transactionId={tx.id} />
          </div>
        )}
      </div>
    </section>
  );
}
