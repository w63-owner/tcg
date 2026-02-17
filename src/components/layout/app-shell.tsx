import Link from "next/link";
import { Heart, MessageCircle, PlusSquare, Search, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { MobileNav } from "./mobile-nav";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Recherche", icon: Search },
  { href: "/favorites", label: "Favoris", icon: Heart },
  { href: "/sell", label: "Vendre", icon: PlusSquare },
  { href: "/messages", label: "Messages", icon: MessageCircle },
  { href: "/profile", label: "Compte", icon: User },
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 hidden border-b bg-background/90 backdrop-blur md:block">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-3">
          <Link href="/" className="text-lg font-semibold">
            Pokemon Market
          </Link>
          <nav className="flex items-center gap-2">
            {NAV_ITEMS.map((item) => (
              <Button asChild variant="ghost" key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </Button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <form action={signOut}>
                <Button type="submit" variant="outline">
                  Se deconnecter
                </Button>
              </form>
            ) : (
              <Button asChild>
                <Link href="/auth">Connexion</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 pb-28 pt-5 md:px-6 md:pb-10">
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
