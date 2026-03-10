"use client";

import Link from "next/link";
import { Heart, MessageCircle, PlusSquare, Search, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUnreadMessages } from "@/app/messages/unread-messages-provider";

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

export function DesktopNav() {
  const { unreadCount } = useUnreadMessages();

  return (
    <nav className="flex items-center gap-2">
      {NAV_ITEMS.map((item) => (
        <Button asChild variant="ghost" key={item.href} className="relative">
          <Link href={item.href} className="flex items-center gap-1.5">
            {item.label}
            {item.showBadge && unreadCount > 0 ? (
              <Badge variant="destructive" className="h-5 min-w-5 px-1 text-xs">
                {unreadCount > 99 ? "99+" : unreadCount}
              </Badge>
            ) : null}
          </Link>
        </Button>
      ))}
    </nav>
  );
}
