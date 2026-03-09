import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { id: offerId } = await params;
  if (!offerId?.trim()) {
    return NextResponse.json({ error: "Offer ID required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: offer, error } = await supabase
    .from("offers")
    .select("id, offer_amount, status, buyer_id, listing_id")
    .eq("id", offerId.trim())
    .maybeSingle<{
      id: string;
      offer_amount: number;
      status: string;
      buyer_id: string;
      listing_id: string;
    }>();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }
  if (!offer) {
    return NextResponse.json({ error: "Offer not found" }, { status: 404 });
  }

  return NextResponse.json(offer);
}
