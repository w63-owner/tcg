import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/env";
import { logError, logInfo } from "@/lib/observability";

type SendMessageBody = {
  conversationId?: string;
  content?: string;
};

/** En dev uniquement : accepter Authorization: Bearer <access_token> pour les scripts de stress. */
function getBearerToken(request: Request): string | null {
  if (process.env.NODE_ENV !== "development") return null;
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim() || null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SendMessageBody;
    const conversationId = String(body.conversationId ?? "").trim();
    const content = String(body.content ?? "").trim().slice(0, 2000);

    if (!conversationId || !content) {
      return NextResponse.json(
        { error: "conversationId and content are required" },
        { status: 400 },
      );
    }

    const bearerToken = getBearerToken(request);
    let supabase = await createServerClient();
    let {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user && bearerToken) {
      const { url, anonKey } = getSupabasePublicEnv();
      const clientWithToken = createClient(url, anonKey, {
        global: { headers: { Authorization: `Bearer ${bearerToken}` } },
      });
      const { data: bearerUser } = await clientWithToken.auth.getUser(bearerToken);
      if (bearerUser?.user) {
        user = bearerUser.user;
        supabase = clientWithToken;
      }
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: conversation } = await supabase
      .from("conversations")
      .select("id, buyer_id, seller_id")
      .eq("id", conversationId)
      .maybeSingle<{ id: string; buyer_id: string; seller_id: string }>();

    if (
      !conversation ||
      (conversation.buyer_id !== user.id && conversation.seller_id !== user.id)
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: message, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content,
      })
      .select("id, created_at")
      .single<{ id: string; created_at: string }>();

    if (error || !message) {
      logError({
        event: "message_send_failed",
        message: error?.message ?? "insert failed",
        context: { conversationId, userId: user.id },
      });
      return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
    }

    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    logInfo({
      event: "message_sent",
      context: { conversationId, userId: user.id, messageId: message.id },
    });
    return NextResponse.json({ ok: true, messageId: message.id, createdAt: message.created_at });
  } catch (error) {
    logError({
      event: "message_send_exception",
      message: error instanceof Error ? error.message : "unknown exception",
    });
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
