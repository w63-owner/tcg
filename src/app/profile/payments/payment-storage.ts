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
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const record = item as Record<string, unknown>;
        const id = typeof record.id === "string" ? record.id : null;
        const brand = typeof record.brand === "string" ? record.brand : null;
        const last4 = typeof record.last4 === "string" ? record.last4 : null;
        if (!id || !brand || !last4) return null;
        return {
          id,
          brand,
          last4,
          holderName: typeof record.holderName === "string" ? record.holderName : undefined,
          expMonth: typeof record.expMonth === "string" ? record.expMonth : undefined,
          expYear: typeof record.expYear === "string" ? record.expYear : undefined,
        } satisfies PaymentCard;
      })
      .filter((card): card is PaymentCard => card !== null);
  } catch {
    return [];
  }
}

export function savePaymentCards(cards: PaymentCard[]) {
  localStorage.setItem(PAYMENT_STORAGE_KEY, JSON.stringify(cards));
}
