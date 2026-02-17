"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { Heart, MessageCircle, PlusSquare, Search, User } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Recherche", icon: Search },
  { href: "/favorites", label: "Favoris", icon: Heart },
  { href: "/sell", label: "Vendre", icon: PlusSquare },
  { href: "/messages", label: "Messages", icon: MessageCircle },
  { href: "/profile", label: "Compte", icon: User },
];

function isActiveRoute(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileNav() {
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
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] transition-colors",
                    isSellItem &&
                      "bg-primary/10 font-semibold text-primary shadow-[0_2px_8px_rgba(0,0,0,0.08)]",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground",
                    isSellItem && active && "bg-primary text-primary-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
