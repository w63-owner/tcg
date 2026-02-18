"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

function formatListingErrorMessage(code?: string) {
  const value = String(code ?? "").trim();
  if (!value) return "";
  const labels: Record<string, string> = {
    cannot_buy_own_listing: "Tu ne peux pas acheter ta propre annonce.",
    listing_not_available: "Cette annonce n'est plus disponible.",
    listing_lock_failed: "Impossible de verrouiller l'annonce pour le paiement.",
    stripe_session_failed: "Impossible d'ouvrir la session de paiement.",
    stripe_session_exception: "Erreur Stripe inattendue. Reessaie dans quelques instants.",
    stripe_secret_missing: "Paiement indisponible: configuration Stripe manquante.",
    site_url_invalid: "Paiement indisponible: URL de redirection invalide.",
    forbidden: "Action non autorisee.",
  };
  return labels[value] ?? `Action impossible: ${value}`;
}

type ListingErrorToastProps = {
  errorCode?: string;
};

export function ListingErrorToast({ errorCode }: ListingErrorToastProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const handledRef = useRef(false);

  useEffect(() => {
    if (!errorCode || handledRef.current) return;
    handledRef.current = true;
    toast.error(formatListingErrorMessage(errorCode));

    const cleanupTimeout = setTimeout(() => {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.delete("error");
      const query = nextParams.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    }, 900);

    return () => clearTimeout(cleanupTimeout);
  }, [errorCode, pathname, router, searchParams]);

  return null;
}
