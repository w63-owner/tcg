import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddPaymentCardClient } from "../add-payment-card-client";

export default function AddPaymentCardPage() {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="-ml-2 h-9 w-9">
          <Link href="/profile/payments" aria-label="Retour">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Ajouter une carte</h1>
      </div>
      <AddPaymentCardClient />
    </section>
  );
}
