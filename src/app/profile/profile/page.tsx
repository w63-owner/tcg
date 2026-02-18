import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { ProfileDetailsFormClient } from "./profile-details-form-client";

type ProfileRow = {
  id: string;
  username: string;
  avatar_url: string | null;
  kyc_status: "UNVERIFIED" | "PENDING" | "REQUIRED" | "VERIFIED" | "REJECTED";
};

export default async function ProfileDetailsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, kyc_status")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

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
          <div className="bg-muted relative h-16 w-16 shrink-0 overflow-hidden rounded-full border">
            {profile?.avatar_url ? (
              <Image src={profile.avatar_url} alt="Avatar profil" fill sizes="64px" className="object-cover" />
            ) : (
              <div className="text-muted-foreground flex h-full items-center justify-center text-lg font-semibold">
                {initial}
              </div>
            )}
          </div>
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
          />
        </div>
      </div>
    </section>
  );
}
