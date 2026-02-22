import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logError, logInfo } from "@/lib/observability";

type SelectionBody = {
  attemptId?: string;
  selectedCardRefId?: string | null;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isCardKey(value: string) {
  return /^(fr|en|jp):[a-z0-9][a-z0-9._-]*$/i.test(value.trim());
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SelectionBody;
    const attemptId = String(body.attemptId ?? "").trim();
    const selectedCardRefId = String(body.selectedCardRefId ?? "").trim();

    if (!isUuid(attemptId)) {
      return NextResponse.json({ error: "Invalid attemptId" }, { status: 400 });
    }
    if (selectedCardRefId && !isCardKey(selectedCardRefId)) {
      return NextResponse.json({ error: "Invalid selectedCardRefId" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase
      .from("ocr_attempts")
      .update({
        selected_card_ref_id: selectedCardRefId || null,
      })
      .eq("id", attemptId)
      .eq("user_id", user.id);

    if (error) {
      logError({
        event: "ocr_selection_update_failed",
        message: error.message,
        context: { userId: user.id, attemptId },
      });
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    logInfo({
      event: "ocr_selection_updated",
      context: {
        userId: user.id,
        attemptId,
        selectedCardRefId: selectedCardRefId || null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logError({
      event: "ocr_selection_update_exception",
      message: error instanceof Error ? error.message : "Unexpected error",
    });
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}

