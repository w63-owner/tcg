import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireAuthenticatedUser } from "@/lib/auth/require-authenticated-user";
import { ThreadRealtime } from "./thread-realtime";
import { ConversationLiveControls } from "./conversation-live-controls";
import { ConversationThread } from "./conversation-thread";

type ConversationRow = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  listing: Array<{
    id: string;
    title: string;
    cover_image_url: string | null;
    display_price: number | null;
  }> | null;
  buyer: Array<{ id: string; username: string }> | null;
  seller: Array<{ id: string; username: string }> | null;
};

type MessageRow = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
};

type MessagesThreadPageProps = {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<Record<string, string>>;
};

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
      "id, listing_id, buyer_id, seller_id, listing:listings(id, title, cover_image_url, display_price), buyer:profiles!conversations_buyer_id_fkey(id, username), seller:profiles!conversations_seller_id_fkey(id, username)",
    )
    .eq("id", conversationId)
    .maybeSingle<ConversationRow>();

  if (!conversation) {
    notFound();
  }

  if (conversation.buyer_id !== user.id && conversation.seller_id !== user.id) {
    notFound();
  }

  await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("conversation_id", conversation.id)
    .is("read_at", null)
    .neq("sender_id", user.id);

  const { data: messages } = await supabase
    .from("messages")
    .select("id, sender_id, content, created_at, read_at")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true })
    .limit(200);

  const rows = (messages ?? []) as MessageRow[];
  const counterpart =
    conversation.buyer_id === user.id
      ? conversation.seller?.[0]?.username
      : conversation.buyer?.[0]?.username;
  const counterpartUserId =
    conversation.buyer_id === user.id ? conversation.seller_id : conversation.buyer_id;
  const listing = conversation.listing?.[0] ?? null;
  const listingPrice = listing?.display_price ?? null;

  return (
    <section className="flex min-h-[calc(100dvh-10rem)] flex-col gap-3">
      <ThreadRealtime conversationId={conversation.id} />

      <header className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/messages">Retour</Link>
        </Button>
        <Link
          href={`/messages/${conversation.id}/profile`}
          className="text-sm font-semibold hover:underline"
        >
          {counterpart ?? "Utilisateur"}
        </Link>
      </header>

      {listing ? (
        <Link
          href={`/listing/${listing.id}`}
          className="flex items-center gap-3 rounded-md border p-3 transition-colors hover:bg-muted/40"
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
      ) : null}

      <Card className="flex-1 overflow-hidden">
        <CardContent className="h-full pt-6">
          <ConversationThread messages={rows} currentUserId={user.id} />
        </CardContent>
      </Card>

      <div className="border-border/70 rounded-md border bg-background/95 p-2">
        <ConversationLiveControls
          conversationId={conversation.id}
          currentUserId={user.id}
          counterpartUserId={counterpartUserId}
          counterpartName={counterpart ?? "Utilisateur"}
        />
      </div>
    </section>
  );
}
