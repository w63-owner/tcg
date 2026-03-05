"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type BuyButtonProps = {
  listingId: string;
  disabled?: boolean;
  className?: string;
  size?: "default" | "sm" | "lg" | "icon" | "xs" | "icon-xs" | "icon-sm" | "icon-lg";
};

export function BuyButton({
  listingId,
  disabled = false,
  className,
  size = "default",
}: BuyButtonProps) {
  const router = useRouter();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (disabled || isRedirecting) return;
    setIsRedirecting(true);
    router.push(`/checkout/${listingId}`);
  };

  return (
    <Button
      type="button"
      className={className}
      size={size}
      disabled={disabled || isRedirecting}
      onClick={handleClick}
    >
      {isRedirecting ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Redirection en cours...
        </>
      ) : (
        "Acheter"
      )}
    </Button>
  );
}
