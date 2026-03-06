import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const AVATAR_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Non connecté." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { success: false, error: "Requête invalide." },
      { status: 400 },
    );
  }

  const file = formData.get("avatar") ?? formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json(
      { success: false, error: "Aucune image sélectionnée." },
      { status: 400 },
    );
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return NextResponse.json(
      { success: false, error: "L'image ne doit pas dépasser 2 Mo." },
      { status: 400 },
    );
  }
  if (!AVATAR_ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { success: false, error: "Format accepté : JPEG, PNG ou WebP." },
      { status: 400 },
    );
  }

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const safeExt = ["jpeg", "jpg", "png", "webp"].includes(ext) ? ext : "jpg";
  const path = `${user.id}/avatar-${Date.now()}.${safeExt}`;

  const { error: uploadError } = await supabase.storage
    .from("listing-images")
    .upload(path, file, {
      upsert: true,
      contentType: file.type || "image/jpeg",
    });

  if (uploadError) {
    return NextResponse.json(
      { success: false, error: `Upload impossible : ${uploadError.message}` },
      { status: 500 },
    );
  }

  const { data } = supabase.storage.from("listing-images").getPublicUrl(path);
  const avatarUrl = data.publicUrl;

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json(
      { success: false, error: `Mise à jour impossible : ${updateError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, avatarUrl });
}
