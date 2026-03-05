import Link from "next/link";
import { Heart, MessageCircle, PlusSquare, Search, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { MobileNav } from "./mobile-nav";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  showBadge?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Recherche", icon: Search },
  { href: "/favorites", label: "Favoris", icon: Heart },
  { href: "/sell", label: "Vendre", icon: PlusSquare },
  { href: "/messages", label: "Messages", icon: MessageCircle, showBadge: true },
  { href: "/profile", label: "Compte", icon: User },
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let messagesUnreadCount = 0;
  if (user) {
    const { data: convs } = await supabase
      .from("conversations")
      .select("id")
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`);
    const ids = (convs ?? []).map((c) => c.id);
    if (ids.length > 0) {
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .in("conversation_id", ids)
        .is("read_at", null)
        .neq("sender_id", user.id);
      messagesUnreadCount = count ?? 0;
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 hidden border-b bg-background/90 backdrop-blur md:block">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-3">
          <Link href="/" className="text-lg font-semibold">
            Pokemon Market
          </Link>
          <nav className="flex items-center gap-2">
            {NAV_ITEMS.map((item) => (
              <Button asChild variant="ghost" key={item.href} className="relative">
                <Link href={item.href} className="flex items-center gap-1.5">
                  {item.label}
                  {item.showBadge && messagesUnreadCount > 0 ? (
                    <Badge variant="destructive" className="h-5 min-w-5 px-1 text-xs">
                      {messagesUnreadCount > 99 ? "99+" : messagesUnreadCount}
                    </Badge>
                  ) : null}
                </Link>
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
      <MobileNav messagesUnreadCount={messagesUnreadCount} />
    </div>
  );
}
