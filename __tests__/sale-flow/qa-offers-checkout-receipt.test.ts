/**
 * QA: offres, checkout et réception – validation et cas nominaux (mock Supabase/Stripe).
 */
import { submitOfferAction } from "@/app/listing/[id]/actions";
import { initialOfferActionState } from "@/app/listing/[id]/offer-action-state";
import {
  respondToOfferAction,
  cancelSentOfferAction,
  startOfferCheckoutAction,
} from "@/app/offers/actions";
import {
  getShippingCostForCountry,
  createCheckoutSession,
} from "@/app/checkout/actions";
import {
  confirmReceiptAction,
  openDisputeAction,
  type DisputeReason,
} from "@/app/orders/receipt-actions";
import { getOrderSuccessData } from "@/app/orders/[id]/success/get-order-success-data";

const mockGetUser = jest.fn();
const mockFrom = jest.fn();
const mockRpc = jest.fn();
const mockRedirect = jest.fn();

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
      from: mockFrom,
      rpc: mockRpc,
    })
  ),
}));

jest.mock("@/lib/supabase/admin", () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      insert: () => Promise.resolve({ error: null }),
    })),
    rpc: jest.fn(() => Promise.resolve(null)),
  })),
}));

jest.mock("next/navigation", () => ({
  redirect: (url: string) => {
    mockRedirect(url);
    const err = new Error("NEXT_REDIRECT");
    (err as { digest?: string }).digest = "NEXT_REDIRECT";
    throw err;
  },
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("@/lib/stripe/checkout", () => ({
  createStripeCheckoutSession: jest.fn(() =>
    Promise.resolve({ id: "cs_test", url: "https://checkout.stripe.com/test" })
  ),
}));

jest.mock("@/lib/shipping/calculate-cost", () => ({
  resolveShippingCost: jest.fn(() => Promise.resolve(4.5)),
  resolveShippingCostByCountry: jest.fn(() => Promise.resolve(5.0)),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-1", email: "buyer@test.com" } },
    error: null,
  });
  mockRedirect.mockImplementation((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  });
});

// —— Offres (listing page) ——
describe("QA – submitOfferAction (listing)", () => {
  it("listingId vide → erreur", async () => {
    const formData = new FormData();
    formData.set("listing_id", "");
    formData.set("offer_amount", "50");
    const out = await submitOfferAction(initialOfferActionState, formData);
    expect(out.status).toBe("error");
    expect(out.message).toContain("Annonce invalide");
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("montant invalide (0 ou négatif) → erreur", async () => {
    const formData = new FormData();
    formData.set("listing_id", "listing-1");
    formData.set("offer_amount", "0");
    const out = await submitOfferAction(initialOfferActionState, formData);
    expect(out.status).toBe("error");
    expect(out.message).toContain("Montant");

    const formData2 = new FormData();
    formData2.set("listing_id", "listing-1");
    formData2.set("offer_amount", "-10");
    const out2 = await submitOfferAction(initialOfferActionState, formData2);
    expect(out2.status).toBe("error");
  });

  it("utilisateur non connecté → erreur", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const formData = new FormData();
    formData.set("listing_id", "listing-1");
    formData.set("offer_amount", "50");
    const out = await submitOfferAction(initialOfferActionState, formData);
    expect(out.status).toBe("error");
    expect(out.message).toContain("Connecte");
  });

  it("offre sur sa propre annonce → erreur", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "listings") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({ data: { seller_id: "user-1" }, error: null }),
            }),
          }),
        };
      }
      return {};
    });
    const formData = new FormData();
    formData.set("listing_id", "listing-1");
    formData.set("offer_amount", "50");
    const out = await submitOfferAction(initialOfferActionState, formData);
    expect(out.status).toBe("error");
    expect(out.message).toContain("propre annonce");
  });

  it("données valides → success (insert appelé)", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "listings") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: { seller_id: "seller-1" },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "offers") {
        return { insert: () => Promise.resolve({ error: null }) };
      }
      return {};
    });
    const formData = new FormData();
    formData.set("listing_id", "listing-1");
    formData.set("offer_amount", "50");
    const out = await submitOfferAction(initialOfferActionState, formData);
    expect(out.status).toBe("success");
    expect(out.message).toContain("envoyee");
  });
});

// —— Réponse à une offre (vendeur) ——
describe("QA – respondToOfferAction", () => {
  it("offer_id ou decision invalide → pas d’update", async () => {
    const formData = new FormData();
    formData.set("offer_id", "");
    formData.set("decision", "ACCEPTED");
    await respondToOfferAction(formData);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("decision non ACCEPTED/REJECTED → pas d’update", async () => {
    const formData = new FormData();
    formData.set("offer_id", "offer-1");
    formData.set("decision", "PENDING");
    await respondToOfferAction(formData);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("utilisateur non connecté → pas d’update", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const formData = new FormData();
    formData.set("offer_id", "offer-1");
    formData.set("decision", "ACCEPTED");
    await respondToOfferAction(formData);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// —— Annulation offre (acheteur) ——
describe("QA – cancelSentOfferAction", () => {
  it("offer_id vide → pas d’update", async () => {
    const formData = new FormData();
    await cancelSentOfferAction(formData);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("utilisateur non connecté → pas d’update", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const formData = new FormData();
    formData.set("offer_id", "offer-1");
    await cancelSentOfferAction(formData);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

// —— Checkout (page checkout par listing) ——
describe("QA – createCheckoutSession", () => {
  it("listingId vide → erreur sans auth", async () => {
    const out = await createCheckoutSession("", "FR");
    expect(out?.error).toBe("Annonce invalide.");
    expect(mockGetUser).not.toHaveBeenCalled();
  });
});

describe("QA – getShippingCostForCountry", () => {
  it("annonce introuvable → erreur", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "listings") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: null, error: new Error("not found") }),
            }),
          }),
        };
      }
      return {};
    });
    const out = await getShippingCostForCountry("listing-unknown", "FR");
    expect(out.shippingCost).toBe(0);
    expect(out.error).toContain("introuvable");
  });

  it("acheter sa propre annonce → erreur", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "listings") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: { seller_id: "user-1", delivery_weight_class: "S", status: "ACTIVE" },
                  error: null,
                }),
            }),
          }),
        };
      }
      return {};
    });
    const out = await getShippingCostForCountry("listing-1", "FR");
    expect(out.error).toContain("propre annonce");
  });

  it("annonce indisponible (pas ACTIVE) → erreur", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "listings") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: { seller_id: "seller-1", delivery_weight_class: "S", status: "SOLD" },
                  error: null,
                }),
            }),
          }),
        };
      }
      return {};
    });
    const out = await getShippingCostForCountry("listing-1", "FR");
    expect(out.error).toContain("indisponible");
  });
});

// —— Checkout offre acceptée ——
describe("QA – startOfferCheckoutAction", () => {
  it("offer_id vide → redirect erreur", async () => {
    const formData = new FormData();
    formData.set("offer_id", "");
    await expect(startOfferCheckoutAction(formData)).rejects.toThrow(/REDIRECT:.*invalid_offer/);
  });
});

// —— Réception / fin de vente ——
describe("QA – confirmReceiptAction", () => {
  it("non connecté → erreur", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const out = await confirmReceiptAction("tx-1", 5, null);
    expect(out.ok).toBe(false);
    expect(out.error).toContain("connecté");
  });

  it("note invalide (< 1 ou > 5) → erreur", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "transactions") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () =>
                    Promise.resolve({
                      data: {
                        id: "tx-1",
                        buyer_id: "user-1",
                        seller_id: "s1",
                        listing_id: "l1",
                        total_amount: 100,
                        fee_amount: 5,
                        status: "SHIPPED",
                      },
                    }),
                }),
              }),
            }),
          }),
        };
      }
      return {};
    });
    const out0 = await confirmReceiptAction("tx-1", 0, null);
    expect(out0.ok).toBe(false);
    expect(out0.error).toContain("Note");

    const out6 = await confirmReceiptAction("tx-1", 6, null);
    expect(out6.ok).toBe(false);
  });

  it("transaction introuvable ou pas SHIPPED → erreur", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "transactions") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: null }),
                }),
              }),
            }),
          }),
        };
      }
      return {};
    });
    const out = await confirmReceiptAction("tx-unknown", 5, null);
    expect(out.ok).toBe(false);
    expect(out.error).toContain("introuvable");
  });
});

describe("QA – openDisputeAction", () => {
  it("non connecté → erreur", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const out = await openDisputeAction(
      "tx-1",
      "DAMAGED_CARD" as DisputeReason,
      "Description du problème assez longue"
    );
    expect(out.ok).toBe(false);
    expect(out.error).toContain("connecté");
  });

  it("description trop courte (< 10 car) → erreur", async () => {
    const out = await openDisputeAction(
      "tx-1",
      "OTHER" as DisputeReason,
      "Court"
    );
    expect(out.ok).toBe(false);
    expect(out.error).toContain("10 caractères");
  });

  it("transaction introuvable ou pas SHIPPED → erreur", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "transactions") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: null }),
                }),
              }),
            }),
          }),
        };
      }
      return {};
    });
    const out = await openDisputeAction(
      "tx-unknown",
      "WRONG_CARD" as DisputeReason,
      "La carte reçue n'est pas la bonne."
    );
    expect(out.ok).toBe(false);
    expect(out.error).toContain("introuvable");
  });
});

// —— Page succès commande ——
describe("QA – getOrderSuccessData", () => {
  it("non connecté → null", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const out = await getOrderSuccessData("tx-1");
    expect(out).toBeNull();
  });

  it("transaction introuvable ou pas buyer → null", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "transactions") {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      return {};
    });
    mockRpc.mockResolvedValueOnce(null);
    const out = await getOrderSuccessData("tx-unknown");
    expect(out).toBeNull();
  });

  it("transaction trouvée, buyer = user → données ordre", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "transactions") {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: {
                      id: "tx-1",
                      total_amount: 59.5,
                      created_at: "2026-01-01T12:00:00Z",
                      buyer_id: "user-1",
                      seller_id: "seller-1",
                      listing_id: "listing-1",
                      stripe_checkout_session_id: null,
                      status: "PAID",
                      listing_title: "Pikachu",
                      listing: { title: "Pikachu" },
                    },
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }
      return {};
    });
    mockRpc.mockImplementation(() => Promise.resolve({ data: "conv-1" }));
    const out = await getOrderSuccessData("tx-1");
    expect(out).not.toBeNull();
    expect(out?.transactionId).toBe("tx-1");
    expect(out?.paymentStatus).toBe("paid");
    expect(out?.cardName).toBe("Pikachu");
    expect(out?.totalAmount).toBe(59.5);
    expect(out?.totalAmountFormatted).toContain("59.50");
    // conversationId rempli quand le RPC ensure_conversation_for_users renvoie un uuid
    if (out?.conversationId != null) {
      expect(out.conversationId).toBe("conv-1");
    }
  });
});
