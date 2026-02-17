import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuthenticatedUser } from "@/lib/auth/require-authenticated-user";

type ConversationProfileRow = {
  id: string;
  buyer_id: string;
  seller_id: string;
  buyer: Array<{ id: string; username: string }> | null;
  seller: Array<{ id: string; username: string }> | null;
};

type ConversationProfilePageProps = {
  params: Promise<{ conversationId: string }>;
};

export default async function ConversationProfilePage({
  params,
}: ConversationProfilePageProps) {
  const { conversationId } = await params;
  const { supabase, user } = await requireAuthenticatedUser(
    `/messages/${conversationId}/profile`,
  );

  const { data: conversation } = await supabase
    .from("conversations")
    .select(
      "id, buyer_id, seller_id, buyer:profiles!conversations_buyer_id_fkey(id, username), seller:profiles!conversations_seller_id_fkey(id, username)",
    )
    .eq("id", conversationId)
    .maybeSingle<ConversationProfileRow>();

  if (!conversation) notFound();
  if (conversation.buyer_id !== user.id && conversation.seller_id !== user.id) notFound();

  const isBuyer = conversation.buyer_id === user.id;
  const counterpart = isBuyer ? conversation.seller?.[0] : conversation.buyer?.[0];

  return (
    <section className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href={`/messages/${conversationId}`}>Retour a la conversation</Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="font-medium">Pseudo:</span>{" "}
            {counterpart?.username ?? "Utilisateur"}
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
