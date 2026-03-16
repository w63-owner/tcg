import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

type ConversationHeaderProps = {
  conversationId: string;
  counterpart: string | null;
  listing: {
    id: string;
    title: string;
    cover_image_url: string | null;
    display_price: number | null;
  } | null;
};

export function ConversationHeader({
  conversationId,
  counterpart,
  listing,
}: ConversationHeaderProps) {
  const listingPrice = listing?.display_price ?? null;

  return (
    <div className="grid gap-1.5 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-1.5 md:pt-1.5">
      <header className="relative flex items-center justify-center py-1">
        <Button asChild variant="ghost" size="icon" className="absolute left-0 h-8 w-8">
          <Link href="/messages" aria-label="Retour aux conversations">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Link
          href={
            counterpart
              ? `/u/${encodeURIComponent(counterpart)}`
              : `/messages/${conversationId}/profile`
          }
          className="text-center text-sm font-semibold hover:underline"
        >
          {counterpart ?? "Utilisateur"}
        </Link>
      </header>

      <div className="rounded-md border px-2.5 py-2">
        {listing ? (
          <Link
            href={`/listing/${listing.id}`}
            className="flex items-center gap-2.5 transition-colors hover:bg-muted/40"
          >
            <div className="bg-muted relative h-10 w-9 shrink-0 overflow-hidden rounded-sm border">
              {listing.cover_image_url ? (
                <Image
                  src={listing.cover_image_url}
                  alt={listing.title}
                  fill
                  sizes="36px"
                  className="object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0">
              <p className="line-clamp-1 text-sm font-semibold leading-tight">{listing.title}</p>
              <p className="text-muted-foreground text-xs leading-tight">
                {typeof listingPrice === "number"
                  ? `${listingPrice.toFixed(2)} EUR`
                  : "Prix indisponible"}
              </p>
            </div>
          </Link>
        ) : (
          <p className="text-muted-foreground text-xs">
            Informations annonce indisponibles.
          </p>
        )}
      </div>
    </div>
  );
}
