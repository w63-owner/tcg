import { notFound } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/require-authenticated-user";
import { ThreadRealtime } from "./thread-realtime";
import { ConversationHeader } from "./conversation-header";
import { ConversationLiveControls } from "./conversation-live-controls";
import { ConversationThreadConnected } from "./conversation-thread";
import { MessagesConversationProvider } from "./messages-conversation-state";
import { OfferModal } from "./offer-modal";
import { AcceptOfferForm } from "./accept-offer-form";
import { BuyReservedForm } from "./buy-reserved-form";
import { TrackingCard } from "./receipt-action-client";
import { ShippingModalTrigger } from "@/app/profile/sales/shipping-modal-client";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type ConversationRow = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  listing:
    | {
        id: string;
        title: string;
        cover_image_url: string | null;
        display_price: number | null;
        status?: string;
      }
    | Array<{
        id: string;
        title: string;
        cover_image_url: string | null;
        display_price: number | null;
        status?: string;
      }>
    | null;
  buyer: Array<{ id: string; username: string }> | null;
  seller: Array<{ id: string; username: string }> | null;
};

type OfferRow = {
  id: string;
  offer_amount: number;
  status: string;
  buyer_id: string;
  listing_id: string;
};

import type { ImageMessageMetadata, SystemMessageMetadata } from "../types";

type MessageRow = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
  message_type?: string | null;
  offer_id?: string | null;
  offer?: OfferRow | OfferRow[] | null;
  metadata?: SystemMessageMetadata | ImageMessageMetadata;
};

type MessagesThreadPageProps = {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<Record<string, string>>;
};

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function MessagesThreadPage({
  params,
}: MessagesThreadPageProps) {
  const { conversationId } = await params;
  const { supabase, user } = await requireAuthenticatedUser(
    `/messages/${conversationId}`,
  );

  const { data: conversation } = await supabase
    .from("conversations")
    .select(
      "id, listing_id, buyer_id, seller_id, listing:listings(id, title, cover_image_url, display_price, status), buyer:profiles!conversations_buyer_id_fkey(id, username), seller:profiles!conversations_seller_id_fkey(id, username)",
    )
    .eq("id", conversationId)
    .maybeSingle<ConversationRow>();

  if (!conversation) {
    notFound();
  }

  if (conversation.buyer_id !== user.id && conversation.seller_id !== user.id) {
    notFound();
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("id, sender_id, content, created_at, read_at, message_type, offer_id, metadata, offer:offers(id, offer_amount, status, buyer_id, listing_id)")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true })
    .limit(50);

  const [acceptedOfferRes, pendingOfferRes, paidTransactionRes] = await Promise.all([
    supabase
      .from("offers")
      .select("id")
      .eq("conversation_id", conversation.id)
      .eq("buyer_id", user.id)
      .eq("status", "ACCEPTED")
      .maybeSingle<{ id: string }>(),
    supabase
      .from("offers")
      .select("id")
      .eq("conversation_id", conversation.id)
      .eq("buyer_id", user.id)
      .eq("status", "PENDING")
      .maybeSingle<{ id: string }>(),
    supabase
      .from("transactions")
      .select("id")
      .eq("listing_id", conversation.listing_id)
      .eq("buyer_id", conversation.buyer_id)
      .eq("seller_id", conversation.seller_id)
      .eq("status", "PAID")
      .limit(1)
      .maybeSingle<{ id: string }>(),
  ]);

  const acceptedOfferRow = acceptedOfferRes.data;
  const pendingOfferRow = pendingOfferRes.data;
  const paidTransactionRow = paidTransactionRes.data;

  const rows = (messages ?? []) as MessageRow[];
  const counterpart =
    conversation.buyer_id === user.id
      ? pickOne(conversation.seller)?.username
      : pickOne(conversation.buyer)?.username;
  const counterpartUserId =
    conversation.buyer_id === user.id ? conversation.seller_id : conversation.buyer_id;

  let listing = pickOne(conversation.listing);
  if (!listing && conversation.listing_id) {
    const { data: rpcListingRows } = await supabase.rpc("get_listing_for_conversation", {
      p_conversation_id: conversationId,
    });
    const first = Array.isArray(rpcListingRows) ? rpcListingRows[0] : rpcListingRows;
    if (first) {
      const price =
        typeof first.display_price === "number"
          ? first.display_price
          : Number(first.display_price);
      listing = {
        id: first.id,
        title: first.title,
        cover_image_url: first.cover_image_url,
        display_price: Number.isFinite(price) ? price : null,
        status: first.status,
      };
    }
  }

  const listingPrice = listing?.display_price ?? null;
  const canOffer = Boolean(listing && user.id !== conversation.seller_id);
  const basePrice = typeof listingPrice === "number" ? listingPrice : 0;
  const acceptedOfferId = acceptedOfferRow?.id ?? null;
  const hasPendingOfferFromBuyer = Boolean(pendingOfferRow?.id);
  const hasPaidTransaction = Boolean(paidTransactionRow?.id);
  const isSeller = user.id === conversation.seller_id;
  const isBuyer = user.id === conversation.buyer_id;
  const listingAvailableForOffer =
    listing && listing.status !== "SOLD" && listing.status !== "LOCKED";
  const listingAlreadySold = listing?.status === "SOLD";
  const showOfferButton =
    canOffer && !hasPendingOfferFromBuyer && Boolean(listingAvailableForOffer);

  let shippedTransaction: {
    id: string;
    tracking_number: string | null;
    tracking_url: string | null;
    status: string;
  } | null = null;
  if (isBuyer) {
    const { data: txRow } = await supabase
      .from("transactions")
      .select("id, tracking_number, tracking_url, status")
      .eq("listing_id", conversation.listing_id)
      .eq("buyer_id", conversation.buyer_id)
      .eq("seller_id", conversation.seller_id)
      .eq("status", "SHIPPED")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{
        id: string;
        tracking_number: string | null;
        tracking_url: string | null;
        status: string;
      }>();
    shippedTransaction = txRow ?? null;
  }

  const showShippingButton = Boolean(isSeller && paidTransactionRow?.id);
  const showOfferBar = Boolean(
    listing && basePrice > 0 && showOfferButton,
  );
  const showBuyReservedBar = Boolean(
    acceptedOfferId && !isSeller && !hasPaidTransaction && !listingAlreadySold,
  );
  const showReceiptConfirmBar = Boolean(isBuyer && shippedTransaction);
  const extraBottomBars = [
    showShippingButton,
    showOfferBar,
    showBuyReservedBar,
    showReceiptConfirmBar,
  ].filter(Boolean).length;
  const bottomPadding =
    extraBottomBars > 0
      ? `pb-[calc(${8.5 + extraBottomBars * 3.5}rem+var(--safe-area-bottom))]`
      : "pb-[calc(8.5rem+var(--safe-area-bottom))]";

  return (
    <section
      className={`flex min-h-[calc(100dvh-8rem)] flex-col gap-3 md:pb-0 ${bottomPadding}`}
    >
      <MessagesConversationProvider
        key={conversation.id}
        initialMessages={rows}
        conversationId={conversation.id}
        currentUserId={user.id}
        initialHasMore={rows.length >= 50}
      >
        <ThreadRealtime conversationId={conversation.id} currentUserId={user.id} />

        <ConversationHeader
          conversationId={conversation.id}
          counterpart={counterpart ?? null}
          listing={listing}
        />

      <div className="flex-1 overflow-hidden">
        <div className="h-full pt-3">
          <ConversationThreadConnected
            conversationId={conversation.id}
            currentUserId={user.id}
            sellerId={conversation.seller_id}
            buyerUsername={pickOne(conversation.buyer)?.username ?? null}
            counterpartName={counterpart ?? null}
          />
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 flex flex-col backdrop-blur md:static md:rounded-md">
        {showShippingButton ? (
          <div className="bg-background/95 px-4 py-2 md:px-4 md:py-2">
            <ShippingModalTrigger
              transactionId={paidTransactionRow!.id}
              triggerClassName="w-full"
            />
          </div>
        ) : null}
        {showOfferBar ? (
          <div className="bg-background/95 px-4 py-2 md:px-4 md:py-2">
            <OfferModal
              conversationId={conversation.id}
              listingId={listing!.id}
              listingTitle={listing!.title}
              listingCoverUrl={listing!.cover_image_url ?? undefined}
              basePrice={basePrice}
              canOffer={true}
            />
          </div>
        ) : null}
        {showBuyReservedBar ? (
          <div className="bg-background/95 px-4 py-2 md:px-4 md:py-2">
            <BuyReservedForm offerId={acceptedOfferId!} />
          </div>
        ) : null}
        {showReceiptConfirmBar && shippedTransaction ? (
          <div className="bg-background/95 px-4 py-2 md:px-4 md:py-2">
            <TrackingCard transaction={shippedTransaction} />
          </div>
        ) : null}
        <div className="bg-background/95 px-4 pt-2 pb-[max(0.75rem,var(--safe-area-bottom))] md:p-2">
          <ConversationLiveControls
            conversationId={conversation.id}
            currentUserId={user.id}
            counterpartUserId={counterpartUserId}
            counterpartName={counterpart ?? "Utilisateur"}
          />
        </div>
      </div>
      </MessagesConversationProvider>
    </section>
  );
}
