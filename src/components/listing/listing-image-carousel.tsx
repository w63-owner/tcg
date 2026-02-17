"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";

type ListingCarouselImage = {
  src: string;
  alt: string;
};

type ListingImageCarouselProps = {
  images: Array<ListingCarouselImage | null>;
};

export function ListingImageCarousel({ images }: ListingImageCarouselProps) {
  const validImages = useMemo(
    () => images.filter((image): image is ListingCarouselImage => Boolean(image?.src)),
    [images],
  );
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  if (validImages.length === 0) {
    return (
      <div className="bg-muted aspect-[3/4]">
        <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
          Pas de photo
        </div>
      </div>
    );
  }

  const clampedIndex = Math.min(index, validImages.length - 1);
  const current = validImages[clampedIndex];
  const hasMultiple = validImages.length > 1;

  const goTo = (nextIndex: number) => {
    const maxIndex = validImages.length - 1;
    if (nextIndex < 0) {
      setIndex(maxIndex);
      return;
    }
    if (nextIndex > maxIndex) {
      setIndex(0);
      return;
    }
    setIndex(nextIndex);
  };

  const onTouchStart: React.TouchEventHandler<HTMLDivElement> = (event) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };

  const onTouchEnd: React.TouchEventHandler<HTMLDivElement> = (event) => {
    if (!hasMultiple) return;
    const startX = touchStartX.current;
    const endX = event.changedTouches[0]?.clientX;
    touchStartX.current = null;
    if (startX == null || endX == null) return;

    const delta = endX - startX;
    const minSwipeDistance = 35;
    if (Math.abs(delta) < minSwipeDistance) return;

    if (delta < 0) {
      goTo(clampedIndex + 1);
      return;
    }
    goTo(clampedIndex - 1);
  };

  return (
    <div className="space-y-2">
      <div
        className="bg-muted relative aspect-[3/4] overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <Image
          key={current.src}
          src={current.src}
          alt={current.alt}
          width={720}
          height={960}
          className="h-full w-full object-cover"
        />
      </div>

      {hasMultiple ? (
        <div className="flex items-center justify-center gap-1.5">
          {validImages.map((_, dotIndex) => (
            <button
              key={`dot-${dotIndex}`}
              type="button"
              aria-label={`Aller a la photo ${dotIndex + 1}`}
              onClick={() => setIndex(dotIndex)}
              className={`h-2 w-2 rounded-full border ${
                dotIndex === clampedIndex
                  ? "border-foreground bg-foreground"
                  : "border-muted-foreground/50 bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
