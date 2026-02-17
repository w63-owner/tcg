"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
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
      <div className="bg-muted aspect-[63/88]">
        <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
          Pas de photo
        </div>
      </div>
    );
  }

  const clampedIndex = Math.min(index, validImages.length - 1);
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
        className="bg-muted relative aspect-[63/88] overflow-hidden select-none touch-pan-y"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex h-full w-full transition-transform duration-300 ease-out"
          style={{ transform: `translateX(-${clampedIndex * 100}%)` }}
        >
          {validImages.map((image, imageIndex) => (
            <div key={`${image.src}-${imageIndex}`} className="relative h-full w-full shrink-0">
              <Image src={image.src} alt={image.alt} fill className="object-cover" />
            </div>
          ))}
        </div>

        {hasMultiple ? (
          <>
            <button
              type="button"
              aria-label="Photo precedente"
              onClick={() => goTo(clampedIndex - 1)}
              className="absolute top-1/2 left-2 z-20 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 bg-black/60 text-white md:flex"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Photo suivante"
              onClick={() => goTo(clampedIndex + 1)}
              className="absolute top-1/2 right-2 z-20 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 bg-black/60 text-white md:flex"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        ) : null}
      </div>

      {hasMultiple ? (
        <div className="flex items-center justify-center gap-1.5">
          {validImages.map((_, dotIndex) => (
            <button
              key={`dot-${dotIndex}`}
              type="button"
              aria-label={`Aller a la photo ${dotIndex + 1}`}
              onClick={() => setIndex(dotIndex)}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  dotIndex === clampedIndex ? "bg-primary" : "bg-muted-foreground/50"
                }`}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
