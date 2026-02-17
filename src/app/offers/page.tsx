import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAuthenticatedUser } from "@/lib/auth/require-authenticated-user";
import {
  cancelSentOfferAction,
  respondToOfferAction,
  startOfferCheckoutAction,
} from "./actions";

type OfferRow = {
  id: string;
  listing_id: string;
  buyer_id: string;
  offer_amount: number;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "CANCELLED";
  created_at: string;
  expires_at: string;
  listing: Array<{
    id: string;
    title: string;
    seller_id: string;
    status: string;
    display_price: number | null;
    delivery_weight_class: string;
  }> | null;
};

type SearchParams = {
  error?: string;
  checkout?: string;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function statusVariant(status: OfferRow["status"]) {
  if (status === "ACCEPTED") return "secondary";
  if (status === "REJECTED" || status === "EXPIRED" || status === "CANCELLED") {
    return "outline";
  }
  return "default";
}

type OffersPageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function OffersPage({ searchParams }: OffersPageProps) {
  const params = await searchParams;
  const { supabase, user } = await requireAuthenticatedUser("/offers");

  const { data } = await supabase
    .from("offers")
    .select(
      "id, listing_id, buyer_id, offer_amount, status, created_at, expires_at, listing:listings(id, title, seller_id, status, display_price)",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const offers = (data ?? []) as OfferRow[];
  const receivedOffers = offers.filter((offer) => offer.listing?.[0]?.seller_id === user.id);
  const sentOffers = offers.filter((offer) => offer.buyer_id === user.id);
  const acceptedSentOffers = sentOffers.filter(
    (offer) => offer.status === "ACCEPTED" && offer.listing?.[0]?.status === "ACTIVE",
  );
  const pendingReceivedOffers = receivedOffers.filter((offer) => offer.status === "PENDING");
  const acceptedTotal = acceptedSentOffers.reduce(
    (sum, offer) => sum + Number(offer.offer_amount),
    0,
  );

  return (
    <section className="space-y-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Mes offres</h1>
        <p className="text-muted-foreground text-sm">
          Gere les offres recues (vendeur) et envoyees (acheteur).
        </p>
      </header>
      {params.error ? (
        <p className="text-destructive rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          Action impossible: {params.error}
        </p>
      ) : null}
      {params.checkout === "cancelled" ? (
        <p className="rounded-md border p-3 text-sm">
          Paiement annule. Tu peux relancer le checkout depuis cette page.
        </p>
      ) : null}
      <Card className="sticky top-16 z-10 border-primary/30 bg-background/95 backdrop-blur">
        <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-6 text-sm">
          <p>
            <span className="font-medium">Recues en attente:</span>{" "}
            {pendingReceivedOffers.length}
          </p>
          <p>
            <span className="font-medium">Offres acceptees a payer:</span>{" "}
            {acceptedSentOffers.length}
          </p>
          <p>
            <span className="font-medium">Total potentiel:</span>{" "}
            {formatMoney(acceptedTotal)}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Offres recues</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {receivedOffers.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Aucune offre recue pour le moment.
              </p>
            ) : (
              receivedOffers.map((offer) => (
                <div key={offer.id} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="line-clamp-1 text-sm font-medium">
                      {offer.listing?.[0]?.title ?? "Annonce"}
                    </p>
                    <Badge variant={statusVariant(offer.status)}>{offer.status}</Badge>
                  </div>
                  <p className="text-sm">Montant: {formatMoney(Number(offer.offer_amount))}</p>
                  <p className="text-muted-foreground text-xs">
                    Expire le {new Date(offer.expires_at).toLocaleString("fr-FR")}
                  </p>
                  {offer.status === "PENDING" ? (
                    <div className="flex gap-2">
                      <form action={respondToOfferAction}>
                        <input type="hidden" name="offer_id" value={offer.id} />
                        <input type="hidden" name="decision" value="ACCEPTED" />
                        <Button type="submit" size="sm">
                          Accepter
                        </Button>
                      </form>
                      <form action={respondToOfferAction}>
                        <input type="hidden" name="offer_id" value={offer.id} />
                        <input type="hidden" name="decision" value="REJECTED" />
                        <Button type="submit" size="sm" variant="outline">
                          Refuser
                        </Button>
                      </form>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Offres envoyees</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sentOffers.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Tu n&apos;as pas encore envoye d&apos;offre.
              </p>
            ) : (
              sentOffers.map((offer) => (
                <div key={offer.id} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="line-clamp-1 text-sm font-medium">
                      {offer.listing?.[0]?.title ?? "Annonce"}
                    </p>
                    <Badge variant={statusVariant(offer.status)}>{offer.status}</Badge>
                  </div>
                  <p className="text-sm">Montant: {formatMoney(Number(offer.offer_amount))}</p>
                  <p className="text-muted-foreground text-xs">
                    Annonce: {offer.listing?.[0]?.status ?? "UNKNOWN"}
                  </p>
                  {offer.status === "PENDING" ? (
                    <form action={cancelSentOfferAction}>
                      <input type="hidden" name="offer_id" value={offer.id} />
                      <Button type="submit" size="sm" variant="outline">
                        Annuler mon offre
                      </Button>
                    </form>
                  ) : null}
                  {offer.status === "ACCEPTED" && offer.listing?.[0]?.status === "ACTIVE" ? (
                    <form action={startOfferCheckoutAction}>
                      <input type="hidden" name="offer_id" value={offer.id} />
                      <Button type="submit" size="sm">
                        Payer cette offre
                      </Button>
                    </form>
                  ) : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
