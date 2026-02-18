export type PaymentCard = {
  id: string;
  brand: string;
  last4: string;
  holderName?: string;
  expMonth?: string;
  expYear?: string;
};

export const PAYMENT_STORAGE_KEY = "profile_payment_cards";

export function loadPaymentCards(): PaymentCard[] {
  try {
    const raw = localStorage.getItem(PAYMENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const cards: PaymentCard[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id : null;
      const brand = typeof record.brand === "string" ? record.brand : null;
      const last4 = typeof record.last4 === "string" ? record.last4 : null;
      if (!id || !brand || !last4) continue;

      const card: PaymentCard = { id, brand, last4 };
      if (typeof record.holderName === "string") card.holderName = record.holderName;
      if (typeof record.expMonth === "string") card.expMonth = record.expMonth;
      if (typeof record.expYear === "string") card.expYear = record.expYear;
      cards.push(card);
    }
    return cards;
  } catch {
    return [];
  }
}

export function savePaymentCards(cards: PaymentCard[]) {
  localStorage.setItem(PAYMENT_STORAGE_KEY, JSON.stringify(cards));
}
