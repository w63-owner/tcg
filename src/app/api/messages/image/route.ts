import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Proxies message attachment images with auth checks.
 * Use when the message_attachments bucket is private and RLS restricts to conversation participants.
 * Query: ?conversationId=...&path=conversationId/uuid.ext
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversationId");
  const path = searchParams.get("path");

  if (!conversationId || !path || path.includes("..")) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  if (!path.startsWith(conversationId + "/")) {
    return NextResponse.json({ error: "Path must belong to conversation" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .maybeSingle<{ id: string }>();

  if (
    !conversation ||
    !(await isParticipant(supabase, conversationId, user.id))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase.storage
    .from("message_attachments")
    .download(path);

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Not found" },
      { status: 404 },
    );
  }

  const contentType =
    path.endsWith(".png")
      ? "image/png"
      : path.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg";

  return new NextResponse(data, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

async function isParticipant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("conversations")
    .select("buyer_id, seller_id")
    .eq("id", conversationId)
    .maybeSingle<{ buyer_id: string; seller_id: string }>();
  return (
    !!data &&
    (data.buyer_id === userId || data.seller_id === userId)
  );
}
