"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ProfileDetailsFormClientProps = {
  userId: string;
  initialPhone: string;
  email: string;
  username: string;
};

type LocalProfileDetails = {
  address: string;
  addressCity?: string;
  addressPostcode?: string;
  addressLat?: number;
  addressLng?: number;
  phone: string;
  dialCode?: string;
  phoneLocal?: string;
  phoneE164?: string;
};

type AddressSuggestion = {
  label: string;
  city: string;
  postcode: string;
  lat: number;
  lng: number;
};

const DIAL_CODE_OPTIONS = [
  { value: "+33", label: "FR +33" },
  { value: "+32", label: "BE +32" },
  { value: "+41", label: "CH +41" },
  { value: "+352", label: "LU +352" },
  { value: "+44", label: "GB +44" },
  { value: "+1", label: "US/CA +1" },
] as const;

function getStorageKey(userId: string) {
  return `profile_details_${userId}`;
}

function parsePhoneNumber(value: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return { dialCode: "+33", phoneLocal: "" };
  if (!raw.startsWith("+")) {
    return { dialCode: "+33", phoneLocal: raw };
  }

  const sortedDialCodes = [...DIAL_CODE_OPTIONS]
    .map((option) => option.value)
    .sort((a, b) => b.length - a.length);
  const dialCode = sortedDialCodes.find((code) => raw.startsWith(code));
  if (!dialCode) return { dialCode: "+33", phoneLocal: raw };
  const localPart = raw.slice(dialCode.length).trim();
  return { dialCode, phoneLocal: localPart };
}

function buildPhoneE164(dialCode: string, phoneLocal: string) {
  const normalizedDial = String(dialCode ?? "").replace(/[^\d+]/g, "");
  let normalizedLocal = String(phoneLocal ?? "").replace(/[^\d]/g, "");
  if (normalizedLocal.startsWith("0")) {
    normalizedLocal = normalizedLocal.slice(1);
  }
  return `${normalizedDial}${normalizedLocal}`.trim();
}

export function ProfileDetailsFormClient({
  userId,
  initialPhone,
  email,
  username,
}: ProfileDetailsFormClientProps) {
  const [address, setAddress] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [addressPostcode, setAddressPostcode] = useState("");
  const [addressLat, setAddressLat] = useState<number | null>(null);
  const [addressLng, setAddressLng] = useState<number | null>(null);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [isAddressLoading, setIsAddressLoading] = useState(false);
  const [dialCode, setDialCode] = useState("+33");
  const [phoneLocal, setPhoneLocal] = useState("");
  const [hydrated, setHydrated] = useState(false);

  const storageKey = useMemo(() => getStorageKey(userId), [userId]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<LocalProfileDetails>;
        setAddress(typeof parsed.address === "string" ? parsed.address : "");
        setAddressCity(typeof parsed.addressCity === "string" ? parsed.addressCity : "");
        setAddressPostcode(typeof parsed.addressPostcode === "string" ? parsed.addressPostcode : "");
        setAddressLat(typeof parsed.addressLat === "number" ? parsed.addressLat : null);
        setAddressLng(typeof parsed.addressLng === "number" ? parsed.addressLng : null);

        const parsedPhone = parsePhoneNumber(
          typeof parsed.phoneE164 === "string"
            ? parsed.phoneE164
            : typeof parsed.phone === "string"
              ? parsed.phone
              : initialPhone,
        );
        setDialCode(
          typeof parsed.dialCode === "string" && parsed.dialCode.length > 0
            ? parsed.dialCode
            : parsedPhone.dialCode,
        );
        setPhoneLocal(
          typeof parsed.phoneLocal === "string" ? parsed.phoneLocal : parsedPhone.phoneLocal,
        );
      } else {
        const parsedPhone = parsePhoneNumber(initialPhone);
        setDialCode(parsedPhone.dialCode);
        setPhoneLocal(parsedPhone.phoneLocal);
      }
    } catch {
      const parsedPhone = parsePhoneNumber(initialPhone);
      setDialCode(parsedPhone.dialCode);
      setPhoneLocal(parsedPhone.phoneLocal);
    } finally {
      setHydrated(true);
    }
  }, [initialPhone, storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    const query = address.trim();
    if (query.length < 3) {
      setAddressSuggestions([]);
      setIsAddressLoading(false);
      return;
    }

    const abortController = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        setIsAddressLoading(true);
        const response = await fetch(
          `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query)}&limit=5`,
          { signal: abortController.signal },
        );
        if (!response.ok) throw new Error("BAN request failed");
        const json = (await response.json()) as {
          features?: Array<{
            geometry?: { coordinates?: [number, number] };
            properties?: {
              label?: string;
              city?: string;
              postcode?: string;
            };
          }>;
        };
        const suggestions = (json.features ?? [])
          .map((feature) => {
            const label = feature.properties?.label?.trim();
            const city = feature.properties?.city?.trim() ?? "";
            const postcode = feature.properties?.postcode?.trim() ?? "";
            const coordinates = feature.geometry?.coordinates;
            const lng = Array.isArray(coordinates) ? Number(coordinates[0]) : NaN;
            const lat = Array.isArray(coordinates) ? Number(coordinates[1]) : NaN;
            if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
            return { label, city, postcode, lat, lng } satisfies AddressSuggestion;
          })
          .filter((value): value is AddressSuggestion => Boolean(value));
        setAddressSuggestions(suggestions);
      } catch {
        if (!abortController.signal.aborted) {
          setAddressSuggestions([]);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsAddressLoading(false);
        }
      }
    }, 280);

    return () => {
      clearTimeout(timeout);
      abortController.abort();
    };
  }, [address, hydrated]);

  const onSave = () => {
    const phoneE164 = buildPhoneE164(dialCode, phoneLocal);
    const payload: LocalProfileDetails = {
      address: address.trim(),
      addressCity: addressCity.trim(),
      addressPostcode: addressPostcode.trim(),
      addressLat: addressLat ?? undefined,
      addressLng: addressLng ?? undefined,
      dialCode,
      phoneLocal: phoneLocal.trim(),
      phoneE164,
      // Backward compatibility with previous storage shape.
      phone: phoneE164,
    };
    localStorage.setItem(storageKey, JSON.stringify(payload));
    toast.success("Informations enregistrees.");
  };

  return (
    <div className="flex min-h-[calc(100dvh-18rem)] flex-col">
      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">Adresse</p>
          <div className="relative">
            <Input
              value={address}
              onChange={(event) => {
                setAddress(event.target.value);
                setAddressCity("");
                setAddressPostcode("");
                setAddressLat(null);
                setAddressLng(null);
              }}
              onFocus={() => setShowAddressSuggestions(true)}
              onBlur={() => {
                setTimeout(() => setShowAddressSuggestions(false), 120);
              }}
              placeholder="Saisis ton adresse"
              className="border-0 border-b border-border bg-transparent px-0 shadow-none rounded-none text-sm focus-visible:ring-0 focus-visible:border-b focus-visible:border-ring"
              disabled={!hydrated}
            />
            {showAddressSuggestions && hydrated && (isAddressLoading || addressSuggestions.length > 0) ? (
              <div className="bg-popover absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-md border shadow-md">
                {isAddressLoading ? (
                  <p className="text-muted-foreground px-3 py-2 text-xs">Recherche d'adresses...</p>
                ) : (
                  <ul>
                    {addressSuggestions.map((suggestion) => (
                      <li key={`${suggestion.label}-${suggestion.lat}-${suggestion.lng}`}>
                        <button
                          type="button"
                          className="hover:bg-accent w-full px-3 py-2 text-left text-xs"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            setAddress(suggestion.label);
                            setAddressCity(suggestion.city);
                            setAddressPostcode(suggestion.postcode);
                            setAddressLat(suggestion.lat);
                            setAddressLng(suggestion.lng);
                            setShowAddressSuggestions(false);
                          }}
                        >
                          {suggestion.label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">Telephone</p>
          <div className="flex items-end gap-2">
            <Select value={dialCode} onValueChange={setDialCode} disabled={!hydrated}>
              <SelectTrigger className="h-9 w-28 border-0 border-b border-border bg-transparent px-0 text-sm shadow-none focus-visible:ring-0 focus-visible:border-b focus-visible:border-ring">
                <SelectValue placeholder="+33" />
              </SelectTrigger>
              <SelectContent>
                {DIAL_CODE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={phoneLocal}
              onChange={(event) => setPhoneLocal(event.target.value)}
              placeholder="Saisis ton numero de telephone"
              className="border-0 border-b border-border bg-transparent px-0 shadow-none rounded-none text-sm focus-visible:ring-0 focus-visible:border-b focus-visible:border-ring"
              disabled={!hydrated}
            />
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">Email</p>
          <p className="text-sm">{email}</p>
        </div>
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">Username</p>
          <p className="text-sm">{username}</p>
        </div>
      </div>
      <Button type="button" onClick={onSave} className="mt-auto w-full" disabled={!hydrated}>
        Enregistrer
      </Button>
    </div>
  );
}
