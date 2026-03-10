"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMessagesConversation } from "./messages-conversation-state";

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
  const { headerVisible } = useMessagesConversation();
  const listingPrice = listing?.display_price ?? null;

  return (
    <div
      className="grid gap-3 overflow-hidden transition-[max-height] duration-200 ease-out"
      style={{
        maxHeight: headerVisible ? "12rem" : "0",
      }}
    >
      <header className="relative flex items-center justify-center">
        <Button asChild variant="ghost" size="icon" className="absolute left-0 h-9 w-9">
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

      <div className="rounded-md border p-3">
        {listing ? (
          <Link
            href={`/listing/${listing.id}`}
            className="flex items-center gap-3 transition-colors hover:bg-muted/40"
          >
            <div className="bg-muted relative h-14 w-12 shrink-0 overflow-hidden rounded-sm border">
              {listing.cover_image_url ? (
                <Image
                  src={listing.cover_image_url}
                  alt={listing.title}
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0">
              <p className="line-clamp-1 text-sm font-semibold">{listing.title}</p>
              <p className="text-muted-foreground text-xs">
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
