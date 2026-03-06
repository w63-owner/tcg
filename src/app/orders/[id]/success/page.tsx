import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Home, Loader2, MessageCircle, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getOrderSuccessData } from "./get-order-success-data";
import { PollPaymentStatus } from "./poll-payment-status";

type PageProps = { params: Promise<{ id: string }> };

export default async function OrderSuccessPage({ params }: PageProps) {
  const { id: transactionId } = await params;
  const data = await getOrderSuccessData(transactionId);

  if (!data) {
    notFound();
  }

  const isPending = data.paymentStatus === "pending";

  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <div className="flex flex-col items-center text-center">
        {isPending ? (
          <>
            <div className="bg-primary/10 text-primary mb-4 flex h-16 w-16 items-center justify-center rounded-full">
              <Loader2 className="h-10 w-10 animate-spin" aria-hidden />
            </div>
            <h1 className="mb-2 text-2xl font-semibold tracking-tight">
              Paiement en cours de traitement
            </h1>
            <p className="text-muted-foreground mb-8 text-sm">
              Votre paiement a bien été reçu. Nous confirmons votre commande sous
              quelques instants.
            </p>
            <PollPaymentStatus transactionId={transactionId} />
          </>
        ) : (
          <>
            <div className="bg-primary/10 text-primary mb-4 flex h-16 w-16 items-center justify-center rounded-full">
              <CheckCircle2 className="h-10 w-10" aria-hidden />
            </div>
            <h1 className="mb-2 text-2xl font-semibold tracking-tight">
              Félicitations ! Votre paiement est confirmé.
            </h1>
            <p className="text-muted-foreground mb-8 text-sm">
              Votre commande a bien été enregistrée.
            </p>
          </>
        )}
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Récapitulatif de la commande</CardTitle>
          <CardDescription>Référence : {data.transactionId}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Article</span>
            <span className="font-medium">{data.cardName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Montant total</span>
            <span className="font-medium">{data.totalAmountFormatted}</span>
          </div>
          {!isPending && (
            data.shippingAddress ? (
              <div className="border-border pt-3">
                <p className="text-muted-foreground mb-1 text-xs font-medium uppercase tracking-wider">
                  Adresse de livraison
                </p>
                <p className="whitespace-pre-line text-sm">{data.shippingAddress}</p>
              </div>
            ) : (
              <p className="text-muted-foreground border-border border-t pt-3 text-sm">
                L&apos;adresse de livraison a été communiquée au vendeur lors du
                paiement.
              </p>
            )
          )}
        </CardContent>
      </Card>

      {!isPending && (
        <>
          <p className="text-muted-foreground mb-8 text-center text-sm">
            Le vendeur a été notifié et doit maintenant expédier votre carte. Vous
            recevrez un email avec les détails d&apos;expédition.
          </p>
        </>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        {data.conversationId ? (
          <Button asChild variant="default">
            <Link href={`/messages/${data.conversationId}`} className="inline-flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              Voir la conversation
            </Link>
          </Button>
        ) : null}
        <Button asChild variant={data.conversationId ? "outline" : "default"}>
          <Link href="/profile/transactions" className="inline-flex items-center gap-2">
            <ShoppingBag className="h-4 w-4" />
            Voir mes achats
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/" className="inline-flex items-center gap-2">
            <Home className="h-4 w-4" />
            Retour à l&apos;accueil
          </Link>
        </Button>
      </div>
    </main>
  );
}
