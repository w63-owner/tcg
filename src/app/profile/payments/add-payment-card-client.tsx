"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadPaymentCards, savePaymentCards } from "./payment-storage";

export function AddPaymentCardClient() {
  const router = useRouter();
  const [holderName, setHolderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [securityCode, setSecurityCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const detectBrand = (digits: string) => {
    if (digits.startsWith("4")) return "VISA";
    if (/^5[1-5]/.test(digits) || /^2(2[2-9]|[3-6]\d|7[01])/.test(digits)) {
      return "MASTERCARD";
    }
    if (/^3[47]/.test(digits)) return "AMEX";
    return "CARTE";
  };

  const onSubmit = () => {
    const normalizedHolder = holderName.trim();
    const normalizedNumber = cardNumber.replace(/\D/g, "");
    const normalizedSecurityCode = securityCode.replace(/\D/g, "");
    const expiryMatch = expiry.trim().match(/^(\d{2})\/(\d{2})$/);
    const month = expiryMatch?.[1] ?? "";
    const year2 = expiryMatch?.[2] ?? "";
    const monthNumber = Number(month);
    const fullYear = year2 ? 2000 + Number(year2) : NaN;

    if (!normalizedHolder) {
      setError("Renseigne le nom figurant sur la carte.");
      return;
    }
    if (normalizedNumber.length < 13 || normalizedNumber.length > 19) {
      setError("Le numero de carte doit contenir entre 13 et 19 chiffres.");
      return;
    }
    if (!expiryMatch || monthNumber < 1 || monthNumber > 12) {
      setError("La date d'expiration doit etre au format MM/AA.");
      return;
    }
    if (!/^\d{3,4}$/.test(normalizedSecurityCode)) {
      setError("Le code de securite doit contenir 3 ou 4 chiffres.");
      return;
    }

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    if (fullYear < currentYear || (fullYear === currentYear && monthNumber < currentMonth)) {
      setError("La carte est expiree.");
      return;
    }

    const normalizedBrand = detectBrand(normalizedNumber);
    const normalizedLast4 = normalizedNumber.slice(-4);
    const cards = loadPaymentCards();
    const next = [
      ...cards,
      {
        id: crypto.randomUUID(),
        brand: normalizedBrand,
        last4: normalizedLast4,
        holderName: normalizedHolder,
        expMonth: month,
        expYear: String(fullYear),
      },
    ];
    savePaymentCards(next);
    router.push("/profile/payments");
    router.refresh();
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">Nom figurant sur la carte</p>
        <Input
          value={holderName}
          onChange={(event) => setHolderName(event.target.value)}
          placeholder="Saisis ton nom et prenom"
          className="border-0 border-b border-border bg-transparent px-0 shadow-none rounded-none text-sm focus-visible:ring-0 focus-visible:border-b focus-visible:border-ring"
        />
      </div>
      <div className="space-y-1">
        <p className="text-muted-foreground text-xs">Numero de carte bancaire</p>
        <Input
          value={cardNumber}
          onChange={(event) => setCardNumber(event.target.value)}
          placeholder="Ex: 4242 4242 4242 4242"
          inputMode="numeric"
          className="border-0 border-b border-border bg-transparent px-0 shadow-none rounded-none text-sm focus-visible:ring-0 focus-visible:border-b focus-visible:border-ring"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">Date d'expiration</p>
          <Input
            value={expiry}
            onChange={(event) => setExpiry(event.target.value)}
            placeholder="MM/AA"
            maxLength={5}
            className="border-0 border-b border-border bg-transparent px-0 shadow-none rounded-none text-sm focus-visible:ring-0 focus-visible:border-b focus-visible:border-ring"
          />
        </div>
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">Code de securite</p>
          <Input
            value={securityCode}
            onChange={(event) => setSecurityCode(event.target.value)}
            placeholder="CVV"
            inputMode="numeric"
            maxLength={4}
            className="border-0 border-b border-border bg-transparent px-0 shadow-none rounded-none text-sm focus-visible:ring-0 focus-visible:border-b focus-visible:border-ring"
          />
        </div>
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
      <Button type="button" className="w-full" onClick={onSubmit}>
        Ajouter la carte
      </Button>
      <p className="text-muted-foreground text-xs">
        Les donnees sont uniquement stockees localement pour la demo.
      </p>
    </div>
  );
}
