import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { ProfileTabs } from "./profile-tabs";
import { ProfileHeaderMenu } from "./profile-header-menu";
import { FollowProfileButton } from "./follow-profile-button";

type PageProps = { params: Promise<{ username: string }> };

export default async function PublicProfilePage({ params }: PageProps) {
  const { username } = await params;
  const decoded = decodeURIComponent(username.trim());
  if (!decoded) notFound();

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, country_code, created_at, bio, instagram_url, facebook_url, tiktok_url")
    .eq("username", decoded)
    .maybeSingle<{
      id: string;
      username: string;
      avatar_url: string | null;
      country_code: string;
      created_at: string;
      bio: string | null;
      instagram_url: string | null;
      facebook_url: string | null;
      tiktok_url: string | null;
    }>();

  if (!profile) notFound();

  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();
  let isFollowing = false;
  if (currentUser && currentUser.id !== profile.id) {
    const { data: fav } = await supabase
      .from("favorite_sellers")
      .select("seller_id")
      .eq("user_id", currentUser.id)
      .eq("seller_id", profile.id)
      .maybeSingle();
    isFollowing = Boolean(fav);
  }

  const [{ data: listings }, { data: reviewsRows }] = await Promise.all([
    supabase
      .from("listings")
      .select("id, title, cover_image_url, display_price")
      .eq("seller_id", profile.id)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: false })
      .limit(48),
    supabase
      .from("reviews")
      .select("id, rating, comment, created_at, reviewer_id")
      .eq("reviewee_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const reviewerIds = [...new Set((reviewsRows ?? []).map((r) => r.reviewer_id))];
  const { data: reviewerProfiles } =
    reviewerIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, username")
          .in("id", reviewerIds)
      : { data: [] };
  const reviewerById = new Map(
    (reviewerProfiles ?? []).map((p) => [p.id, p.username]),
  );

  const reviews = (reviewsRows ?? []).map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment ?? null,
    created_at: r.created_at,
    reviewer_username: reviewerById.get(r.reviewer_id) ?? "Acheteur",
  }));

  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-background pb-8">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 px-4 py-3 backdrop-blur">
        <Button asChild variant="ghost" size="icon" className="-ml-2 h-9 w-9 shrink-0">
          <Link href="/messages" aria-label="Retour">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-foreground truncate text-center text-sm font-semibold">
          {profile.username}
        </h1>
        <div className="w-9 shrink-0">
          <ProfileHeaderMenu username={profile.username} />
        </div>
      </header>

      <div className="px-4 py-4">
        <ProfileTabs
          username={profile.username}
          avatarUrl={profile.avatar_url}
          countryCode={profile.country_code}
          createdAt={profile.created_at}
          bio={profile.bio}
          instagramUrl={profile.instagram_url}
          facebookUrl={profile.facebook_url}
          tiktokUrl={profile.tiktok_url}
          listings={listings ?? []}
          reviews={reviews}
        />
      </div>

      {currentUser && currentUser.id !== profile.id && (
        <FollowProfileButton
          sellerId={profile.id}
          username={profile.username}
          isFollowing={isFollowing}
          returnPath={`/u/${encodeURIComponent(profile.username)}`}
        />
      )}
    </main>
  );
}
