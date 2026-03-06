import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { ProfileAvatarUpload } from "./profile-avatar-upload";
import { ProfileDetailsFormClient } from "./profile-details-form-client";

type ProfileRow = {
  id: string;
  username: string;
  avatar_url: string | null;
  kyc_status: "UNVERIFIED" | "PENDING" | "REQUIRED" | "VERIFIED" | "REJECTED";
  instagram_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  bio: string | null;
};

function defaultUsernameFromEmail(email: string | undefined): string {
  const base = (email ?? "").split("@")[0].replace(/[^a-zA-Z0-9_-]/g, "") || "trainer";
  const name = base.length >= 3 ? base.slice(0, 30) : "trainer";
  return name;
}

export default async function ProfileDetailsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  let { data: profile } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, kyc_status, instagram_url, facebook_url, tiktok_url, bio")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  if (!profile) {
    const baseUsername = defaultUsernameFromEmail(user.email ?? undefined);
    let inserted = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const candidate = attempt === 0 ? baseUsername : `${baseUsername}_${attempt}`.slice(0, 30);
      const { error: insertError } = await supabase.from("profiles").insert({
        id: user.id,
        username: candidate,
        country_code: "FR",
      });
      if (!insertError) {
        inserted = true;
        break;
      }
      if (insertError.code === "23505") continue;
      throw new Error(insertError.message);
    }
    if (inserted) {
      await supabase.from("wallets").upsert(
        { user_id: user.id, available_balance: 0, pending_balance: 0, currency: "EUR" },
        { onConflict: "user_id", ignoreDuplicates: true }
      );
      const { data: newProfile } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, kyc_status, instagram_url, facebook_url, tiktok_url, bio")
        .eq("id", user.id)
        .single<ProfileRow>();
      profile = newProfile ?? null;
    }
  }

  const isVerified = profile?.kyc_status === "VERIFIED";
  const initial = (profile?.username || user.email || "U").slice(0, 1).toUpperCase();

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="-ml-2 h-9 w-9">
          <Link href="/profile" aria-label="Retour">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Profil</h1>
      </div>
      <div>
        <div className="flex flex-col items-center py-3 text-center">
          <ProfileAvatarUpload avatarUrl={profile?.avatar_url ?? null} initial={initial} />
          <div className="mt-2 space-y-1">
            <p className="text-sm font-medium">{profile?.username ?? "Mon profil"}</p>
            {isVerified ? (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Certifie
              </Badge>
            ) : (
              <Badge variant="outline">{profile?.kyc_status ?? "UNVERIFIED"}</Badge>
            )}
          </div>
        </div>
        <div className="space-y-3 py-3">
          <ProfileDetailsFormClient
            userId={user.id}
            initialPhone={user.phone ?? ""}
            email={user.email ?? "--"}
            username={profile?.username ?? "--"}
            initialBio={profile?.bio ?? ""}
            initialInstagramUrl={profile?.instagram_url ?? ""}
            initialFacebookUrl={profile?.facebook_url ?? ""}
            initialTiktokUrl={profile?.tiktok_url ?? ""}
          />
        </div>
      </div>
    </section>
  );
}
