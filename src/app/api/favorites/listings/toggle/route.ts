import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logError, logInfo } from "@/lib/observability";
import { ensureCurrentUserProfile } from "@/lib/profiles/ensure-current-user-profile";

type ToggleRequest = {
  listingId?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ToggleRequest;
    const listingId = String(body.listingId ?? "").trim();
    if (!listingId) {
      return NextResponse.json({ error: "listingId is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await ensureCurrentUserProfile(supabase, user);

    const { data: existing } = await supabase
      .from("favorite_listings")
      .select("listing_id")
      .eq("user_id", user.id)
      .eq("listing_id", listingId)
      .maybeSingle<{ listing_id: string }>();

    if (existing) {
      const { error } = await supabase
        .from("favorite_listings")
        .delete()
        .eq("user_id", user.id)
        .eq("listing_id", listingId);
      if (error) {
        logError({
          event: "favorite_listing_toggle_failed",
          message: error.message,
          context: { listingId, userId: user.id, action: "remove" },
        });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      logInfo({
        event: "favorite_listing_removed",
        context: { listingId, userId: user.id },
      });
      return NextResponse.json({ liked: false });
    }

    const { error } = await supabase.from("favorite_listings").insert({
      user_id: user.id,
      listing_id: listingId,
    });
    if (error) {
      logError({
        event: "favorite_listing_toggle_failed",
        message: error.message,
        context: { listingId, userId: user.id, action: "add" },
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    logInfo({
      event: "favorite_listing_added",
      context: { listingId, userId: user.id },
    });
    return NextResponse.json({ liked: true });
  } catch (error) {
    logError({
      event: "favorite_listing_toggle_exception",
      message: error instanceof Error ? error.message : "unknown exception",
    });
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
