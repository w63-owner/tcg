"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { createSetupIntent } from "./actions";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();

function AddCardForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setError(null);
    setLoading(true);
    try {
      const result = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/profile/payments?added=1`,
        },
      });
      if (result.error) {
        setError(result.error.message ?? "Une erreur est survenue.");
        setLoading(false);
        return;
      }
      if ("setupIntent" in result && result.setupIntent?.status === "succeeded") {
        onSuccess();
      }
      // If status is requires_action, Stripe redirects to return_url; user comes back to profile/payments?added=1
    } catch {
      setError("Une erreur est survenue.");
    }
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ layout: "tabs" }} />
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <Button type="submit" className="w-full" disabled={!stripe || loading}>
        {loading ? "Enregistrement…" : "Enregistrer la carte"}
      </Button>
    </form>
  );
}

export function AddPaymentCardClient() {
  const router = useRouter();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createSetupIntent().then((result) => {
      if ("clientSecret" in result) {
        setClientSecret(result.clientSecret);
      } else {
        setError(result.error ?? "Impossible de charger le formulaire.");
      }
    });
  }, []);

  if (!publishableKey) {
    return (
      <p className="text-destructive text-sm">
        Clé Stripe manquante (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).
      </p>
    );
  }

  if (error) {
    return <p className="text-destructive text-sm">{error}</p>;
  }

  if (!clientSecret) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-10 rounded border bg-muted" />
        <div className="h-32 rounded border bg-muted" />
        <div className="h-10 rounded bg-muted" />
      </div>
    );
  }

  const stripePromise = loadStripe(publishableKey);

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: "stripe",
          variables: { borderRadius: "6px" },
        },
      }}
    >
      <AddCardForm
        onSuccess={() => {
          router.push("/profile/payments");
          router.refresh();
        }}
      />
    </Elements>
  );
}
