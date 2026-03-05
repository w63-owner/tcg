"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { CirclePlus, Heart, House, MessageCircle, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  showBadge?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Recherche", icon: House },
  { href: "/favorites", label: "Favoris", icon: Heart },
  { href: "/sell", label: "Vendre", icon: CirclePlus },
  { href: "/messages", label: "Messages", icon: MessageCircle, showBadge: true },
  { href: "/profile", label: "Compte", icon: User },
];

type MobileNavProps = {
  messagesUnreadCount?: number;
};

function isActiveRoute(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileNav({ messagesUnreadCount = 0 }: MobileNavProps) {
  const pathname = usePathname();
  const hideOnSellFlow = pathname === "/sell" || pathname.startsWith("/sell/");
  const hideOnSearch = pathname === "/search" || pathname.startsWith("/search/");
  const hideOnListing = pathname === "/listing" || pathname.startsWith("/listing/");
  const hideOnConversation = pathname.startsWith("/messages/");

  if (hideOnSellFlow || hideOnSearch || hideOnListing || hideOnConversation) {
    return null;
  }

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[max(0.4rem,var(--safe-area-bottom))] backdrop-blur md:hidden"
        aria-label="Navigation mobile"
      >
        <ul className="mx-auto grid max-w-2xl grid-cols-5 px-1 pt-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActiveRoute(pathname, item.href);
            const isSellItem = item.href === "/sell";
            const unread = item.showBadge ? messagesUnreadCount : 0;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-label={item.label}
                  className={cn(
                    "relative flex items-center justify-center rounded-xl px-2 py-2 transition-colors",
                    isSellItem &&
                      "bg-primary/10 font-semibold text-primary shadow-sm",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground",
                    isSellItem && active && "bg-primary text-primary-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {unread > 0 ? (
                    <Badge
                      variant="destructive"
                      className="absolute -right-0.5 -top-0.5 h-4 min-w-4 px-0.5 text-[10px]"
                    >
                      {unread > 99 ? "99+" : unread}
                    </Badge>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
