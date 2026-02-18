import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { ProfilePreferencesClient } from "./profile-preferences-client";

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  return (
    <section className="space-y-2">
      <h1 className="text-xl font-semibold">Compte</h1>
      <div className="divide-border/60 divide-y">
        <Link href="/profile/profile" className="hover:bg-muted/30 flex items-center justify-between py-4 transition-colors">
          <span className="text-sm font-medium">Profil</span>
          <ChevronRight className="text-muted-foreground h-4 w-4" />
        </Link>
        <Link href="/profile/listings" className="hover:bg-muted/30 flex items-center justify-between py-4 transition-colors">
          <span className="text-sm font-medium">Mes annonces</span>
          <ChevronRight className="text-muted-foreground h-4 w-4" />
        </Link>
        <Link href="/profile/transactions" className="hover:bg-muted/30 flex items-center justify-between py-4 transition-colors">
          <span className="text-sm font-medium">Transactions</span>
          <ChevronRight className="text-muted-foreground h-4 w-4" />
        </Link>
        <Link href="/profile/wallet" className="hover:bg-muted/30 flex items-center justify-between py-4 transition-colors">
          <span className="text-sm font-medium">Mon porte-monnaie</span>
          <ChevronRight className="text-muted-foreground h-4 w-4" />
        </Link>
        <Link href="/profile/payments" className="hover:bg-muted/30 flex items-center justify-between py-4 transition-colors">
          <span className="text-sm font-medium">Paiements</span>
          <ChevronRight className="text-muted-foreground h-4 w-4" />
        </Link>
        <Link href="/profile/notifications" className="hover:bg-muted/30 flex items-center justify-between py-4 transition-colors">
          <span className="text-sm font-medium">Notifications</span>
          <ChevronRight className="text-muted-foreground h-4 w-4" />
        </Link>
        <ProfilePreferencesClient />
        <form action={signOut} className="py-3">
          <Button type="submit" variant="outline" className="w-full">
            Deconnexion
          </Button>
        </form>
        <div className="py-3">
          <Button type="button" variant="destructive" className="w-full" disabled title="Fonction en preparation">
            Suppression compte
          </Button>
        </div>
      </div>
    </section>
  );
}
