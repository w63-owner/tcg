const LISTING_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  ACTIVE: "Active",
  LOCKED: "Réservé",
  SOLD: "Vendu",
};

const OFFER_STATUS_LABELS: Record<string, string> = {
  PENDING: "En attente",
  ACCEPTED: "Acceptée",
  REJECTED: "Refusée",
  EXPIRED: "Expirée",
  CANCELLED: "Annulée",
};

export function formatListingStatusLabel(
  value: string | null | undefined
): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  return LISTING_STATUS_LABELS[raw] ?? raw;
}

export function formatOfferStatusLabel(
  value: string | null | undefined
): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  return OFFER_STATUS_LABELS[raw] ?? raw;
}

const TRANSACTION_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "Paiement en attente",
  PAID: "Payé",
  CANCELLED: "Annulé",
  EXPIRED: "Expiré",
  REFUNDED: "Remboursé",
  SHIPPED: "Expédié",
};

export function formatTransactionStatusLabel(
  value: string | null | undefined
): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  return TRANSACTION_STATUS_LABELS[raw] ?? raw;
}
