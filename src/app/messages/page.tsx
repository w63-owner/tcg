import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { requireAuthenticatedUser } from "@/lib/auth/require-authenticated-user";
import { MessagesRealtimeListener } from "./realtime-listener";

type MessagesPageProps = {
  searchParams: Promise<{ error?: string }>;
};

type ConversationRow = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  updated_at: string;
  listing:
    | { id: string; title: string; cover_image_url: string | null }
    | Array<{ id: string; title: string; cover_image_url: string | null }>
    | null;
  buyer: Array<{ id: string; username: string }> | null;
  seller: Array<{ id: string; username: string }> | null;
};

type MessagePreview = {
  conversation_id: string;
  content: string;
  created_at: string;
  sender_id: string;
};

function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function formatRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "a l'instant";
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60_000));

  if (diffMinutes < 1) return "a l'instant";
  if (diffMinutes < 60) return `il y a ${diffMinutes} min`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `il y a ${diffHours} h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `il y a ${diffDays} j`;

  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return `il y a ${diffWeeks} sem`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `il y a ${diffMonths} mois`;

  const diffYears = Math.floor(diffDays / 365);
  return `il y a ${diffYears} an${diffYears > 1 ? "s" : ""}`;
}

export default async function MessagesPage({ searchParams }: MessagesPageProps) {
  const params = await searchParams;
  const { supabase, user } = await requireAuthenticatedUser("/messages");

  const { data } = await supabase
    .from("conversations")
    .select(
      "id, listing_id, buyer_id, seller_id, updated_at, listing:listings(id, title, cover_image_url), buyer:profiles!conversations_buyer_id_fkey(id, username), seller:profiles!conversations_seller_id_fkey(id, username)",
    )
    .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
    .order("updated_at", { ascending: false })
    .limit(100);

  const conversations = (data ?? []) as ConversationRow[];
  const conversationIds = conversations.map((conversation) => conversation.id);
  const unreadCountsByConversation = new Map<string, number>();
  const latestByConversation = new Map<string, Omit<MessagePreview, "conversation_id">>();

  if (conversationIds.length > 0) {
    const [{ data: unreadRows }, { data: latestRows }] = await Promise.all([
      supabase
        .from("messages")
        .select("conversation_id")
        .in("conversation_id", conversationIds)
        .is("read_at", null)
        .neq("sender_id", user.id),
      supabase
        .from("messages")
        .select("conversation_id, content, created_at, sender_id")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false }),
    ]);

    for (const row of unreadRows ?? []) {
      const key = row.conversation_id as string;
      unreadCountsByConversation.set(key, (unreadCountsByConversation.get(key) ?? 0) + 1);
    }

    for (const row of (latestRows ?? []) as MessagePreview[]) {
      if (!latestByConversation.has(row.conversation_id)) {
        latestByConversation.set(row.conversation_id, {
          content: row.content,
          created_at: row.created_at,
          sender_id: row.sender_id,
        });
      }
    }
  }

  const details = conversations.map((conversation) => {
    const counterpart =
      conversation.buyer_id === user.id
        ? conversation.seller?.[0]?.username
        : conversation.buyer?.[0]?.username;
    const latestMessage = latestByConversation.get(conversation.id) ?? null;

    return {
      ...conversation,
      unreadCount: unreadCountsByConversation.get(conversation.id) ?? 0,
      latestMessage,
      counterpart: counterpart ?? "Utilisateur",
      relativeTime: formatRelativeTime(
        latestMessage?.created_at ?? conversation.updated_at,
      ),
    };
  });
  const conversationsWithMessages = details.filter(
    (conversation) => conversation.latestMessage !== null,
  );

  return (
    <section className="space-y-4">
      <MessagesRealtimeListener />
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Messages</h1>
      </header>

      {params.error ? (
        <p className="text-destructive rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          Action impossible: {params.error}
        </p>
      ) : null}

      {conversationsWithMessages.length === 0 ? (
        <p className="text-muted-foreground rounded-md border p-6 text-center text-sm">
          Aucun message pour le moment.
        </p>
      ) : (
        <div className="divide-border/60 divide-y">
          {conversationsWithMessages.map((conversation) => (
            (() => {
              const listing = pickOne(conversation.listing);
              return (
                <Link
                  key={conversation.id}
                  href={`/messages/${conversation.id}`}
                  className={`flex items-start gap-3 py-3 transition-colors ${
                    conversation.unreadCount > 0
                      ? "bg-primary/10 hover:bg-primary/15"
                      : "hover:bg-muted/40"
                  }`}
                >
                  <div className="bg-muted relative h-14 w-12 shrink-0 overflow-hidden rounded-sm border">
                    {listing?.cover_image_url ? (
                      <Image
                        src={listing.cover_image_url}
                        alt={listing.title ?? "Image annonce"}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="line-clamp-1 text-sm font-semibold">
                      {listing?.title ?? "Annonce"}
                    </p>
                    <p className="text-muted-foreground line-clamp-1 text-xs">
                      {conversation.latestMessage?.content}
                    </p>
                    <p className="text-muted-foreground line-clamp-1 text-xs">
                      {conversation.counterpart} · {conversation.relativeTime}
                    </p>
                  </div>
                  {conversation.unreadCount > 0 ? (
                    <Badge>{conversation.unreadCount}</Badge>
                  ) : null}
                </Link>
              );
            })()
          ))}
        </div>
      )}
    </section>
  );
}
