"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Loader2, Clock } from "lucide-react";

const PROFILE_DETAILS_STORAGE_KEY = (userId: string) => `profile_details_${userId}`;
const CHECKOUT_RESERVATION_SECONDS = 30 * 60; // 30 min, aligné avec le verrou DB et la session Stripe
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { getShippingCostForCountry, createCheckoutSession } from "@/app/checkout/actions";

const COUNTRY_OPTIONS: { value: string; label: string }[] = [
  { value: "FR", label: "France" },
  { value: "BE", label: "Belgique" },
  { value: "ES", label: "Espagne" },
  { value: "CH", label: "Suisse" },
  { value: "LU", label: "Luxembourg" },
  { value: "DE", label: "Allemagne" },
  { value: "IT", label: "Italie" },
];

function toEuro(amount: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type CheckoutFormClientProps = {
  buyerId: string;
  listingId: string;
  listingTitle: string;
  coverImageUrl: string | null;
  displayPrice: number;
  feeAmount: number;
  initialShippingCost: number;
  initialCountryCode: string;
  initialTotal: number;
};

export function CheckoutFormClient({
  buyerId,
  listingId,
  listingTitle,
  coverImageUrl,
  displayPrice,
  feeAmount,
  initialShippingCost,
  initialCountryCode,
  initialTotal,
}: CheckoutFormClientProps) {
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");
  const [countryCode, setCountryCode] = useState(
    COUNTRY_OPTIONS.some((c) => c.value === initialCountryCode)
      ? initialCountryCode
      : "FR",
  );
  const [shippingCost, setShippingCost] = useState(initialShippingCost);
  const [isShippingLoading, setIsShippingLoading] = useState(false);
  const [isPayPending, startPayTransition] = useTransition();
  const [secondsLeft, setSecondsLeft] = useState(CHECKOUT_RESERVATION_SECONDS);
  const [reservationExpired, setReservationExpired] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const total = Math.round((displayPrice + shippingCost) * 100) / 100;

  // Compte à rebours 30 min : à 0 on désactive le paiement et on affiche le message d’expiration
  useEffect(() => {
    setSecondsLeft(CHECKOUT_RESERVATION_SECONDS);
    setReservationExpired(false);
    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          setReservationExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Pre-fill full address from profile (Profil → Profil → Adresse), same localStorage key
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(PROFILE_DETAILS_STORAGE_KEY(buyerId)) : null;
      if (raw) {
        const parsed = JSON.parse(raw) as {
          address?: string;
          addressCity?: string;
          addressPostcode?: string;
          countryCode?: string;
        };
        if (typeof parsed.address === "string" && parsed.address.trim()) setAddress(parsed.address.trim());
        if (typeof parsed.addressCity === "string" && parsed.addressCity.trim()) setCity(parsed.addressCity.trim());
        if (typeof parsed.addressPostcode === "string" && parsed.addressPostcode.trim())
          setPostcode(parsed.addressPostcode.trim());
        if (
          typeof parsed.countryCode === "string" &&
          COUNTRY_OPTIONS.some((c) => c.value === parsed.countryCode)
        ) {
          setCountryCode(parsed.countryCode);
          getShippingCostForCountry(listingId, parsed.countryCode).then((result) => {
            if (!result.error) setShippingCost(result.shippingCost);
          });
        }
      }
    } catch {
      // ignore
    }
  }, [buyerId, listingId]);

  const handleCountryChange = async (newCountry: string) => {
    setCountryCode(newCountry);
    setIsShippingLoading(true);
    const result = await getShippingCostForCountry(listingId, newCountry);
    setIsShippingLoading(false);
    if (result.error) {
      toast.error(result.error);
      setShippingCost(initialShippingCost);
      return;
    }
    setShippingCost(result.shippingCost);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Persist full address to same localStorage as Profil → Profil → Adresse
    try {
      const key = PROFILE_DETAILS_STORAGE_KEY(buyerId);
      const existing = typeof window !== "undefined" ? localStorage.getItem(key) : null;
      const existingData = existing ? (JSON.parse(existing) as Record<string, unknown>) : {};
      localStorage.setItem(
        key,
        JSON.stringify({
          ...existingData,
          address: address.trim(),
          addressCity: city.trim(),
          addressPostcode: postcode.trim(),
          countryCode,
        }),
      );
    } catch {
      // ignore
    }
    startPayTransition(async () => {
      try {
        const result = await createCheckoutSession(listingId, countryCode);
        if (result?.error) {
          toast.error(result.error);
        }
      } catch {
        toast.error("Une erreur inattendue s'est produite.");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {reservationExpired ? (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200">
          <p className="font-medium">Le délai de réservation est expiré.</p>
          <p className="mt-1 text-sm opacity-90">
            Cet article est de nouveau disponible pour les autres acheteurs. Recharge la page pour le réserver à nouveau.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 border-orange-300 text-orange-800 hover:bg-orange-100 dark:border-orange-700 dark:text-orange-200 dark:hover:bg-orange-900/50"
            onClick={() => window.location.reload()}
          >
            Recharger la page
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200">
          <Clock className="h-4 w-4 shrink-0" aria-hidden />
          <p className="text-sm">
            Cet article t'est réservé pendant <strong>{formatCountdown(secondsLeft)}</strong>. Au-delà, il sera de nouveau disponible pour les autres acheteurs.
          </p>
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Article</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          {coverImageUrl ? (
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border bg-muted">
              <Image
                src={coverImageUrl}
                alt={listingTitle}
                fill
                className="object-cover"
                sizes="80px"
              />
            </div>
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground text-xs">
              Image
            </div>
          )}
          <p className="flex-1 font-medium leading-tight">{listingTitle}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Adresse de livraison</CardTitle>
          <CardDescription>
            Préremplie depuis ton profil (Profil → Profil → Adresse). Tu peux modifier ici ; le pays détermine les frais de port.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="address">Adresse</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Numéro et nom de rue"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">Ville</Label>
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ville"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postcode">Code postal</Label>
              <Input
                id="postcode"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                placeholder="Code postal"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="country">Pays</Label>
            <Select
              value={countryCode}
              onValueChange={handleCountryChange}
              disabled={isShippingLoading}
            >
              <SelectTrigger id="country" className="w-full">
                <SelectValue placeholder="Choisir un pays" />
              </SelectTrigger>
              <SelectContent>
                {COUNTRY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isShippingLoading && (
              <p className="text-muted-foreground text-xs flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Mise à jour des frais de port...
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Récapitulatif</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Prix de la carte</span>
            <span>{toEuro(displayPrice)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Frais de protection acheteur</span>
            <span>{toEuro(feeAmount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Frais de port</span>
            {isShippingLoading ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <span>{toEuro(shippingCost)}</span>
            )}
          </div>
          <Separator className="my-2" />
          <div className="flex justify-between font-semibold">
            <span>Total à payer</span>
            {isShippingLoading ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              <span>{toEuro(total)}</span>
            )}
          </div>
        </CardContent>
        <CardContent className="pt-0">
          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={isPayPending || isShippingLoading || reservationExpired}
          >
            {isPayPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Redirection vers le paiement...
              </>
            ) : (
              <>Payer {toEuro(total)}</>
            )}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
