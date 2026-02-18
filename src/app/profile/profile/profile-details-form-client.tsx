"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ProfileDetailsFormClientProps = {
  userId: string;
  initialPhone: string;
  email: string;
  username: string;
};

type LocalProfileDetails = {
  address: string;
  phone: string;
};

function getStorageKey(userId: string) {
  return `profile_details_${userId}`;
}

export function ProfileDetailsFormClient({
  userId,
  initialPhone,
  email,
  username,
}: ProfileDetailsFormClientProps) {
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState(initialPhone);
  const [hydrated, setHydrated] = useState(false);

  const storageKey = useMemo(() => getStorageKey(userId), [userId]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<LocalProfileDetails>;
        setAddress(typeof parsed.address === "string" ? parsed.address : "");
        setPhone(typeof parsed.phone === "string" ? parsed.phone : initialPhone);
      } else {
        setPhone(initialPhone);
      }
    } catch {
      setPhone(initialPhone);
    } finally {
      setHydrated(true);
    }
  }, [initialPhone, storageKey]);

  const onSave = () => {
    const payload: LocalProfileDetails = {
      address: address.trim(),
      phone: phone.trim(),
    };
    localStorage.setItem(storageKey, JSON.stringify(payload));
    toast.success("Informations enregistrees.");
  };

  return (
    <div className="flex min-h-[calc(100dvh-18rem)] flex-col">
      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">Adresse</p>
          <Input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Saisis ton adresse"
            className="border-0 border-b border-border bg-transparent px-0 shadow-none rounded-none text-sm focus-visible:ring-0 focus-visible:border-b focus-visible:border-ring"
            disabled={!hydrated}
          />
        </div>
        <div className="space-y-1">
          <p className="text-muted-foreground text-xs">Telephone</p>
          <Input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="Saisis ton numero de telephone"
            className="border-0 border-b border-border bg-transparent px-0 shadow-none rounded-none text-sm focus-visible:ring-0 focus-visible:border-b focus-visible:border-ring"
            disabled={!hydrated}
          />
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
