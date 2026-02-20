"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Camera, CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListingImageCarousel } from "@/components/listing/listing-image-carousel";
import { createListingAction } from "./actions";
import { initialSellFormState } from "./sell-form-state";
import { formatConditionLabel } from "@/lib/listings/condition-label";

const CONDITIONS = [
  "MINT",
  "NEAR_MINT",
  "EXCELLENT",
  "GOOD",
  "LIGHT_PLAYED",
  "PLAYED",
  "POOR",
] as const;

const GRADING_COMPANIES = ["PSA", "PCA", "BGS", "CGC", "SGC", "ACE", "OTHER"] as const;
const RARITY_OPTIONS = [
  "COMMON",
  "UNCOMMON",
  "RARE",
  "HOLO",
  "ULTRA_RARE",
  "SECRET_RARE",
  "PROMO",
] as const;
const FINISH_OPTIONS = [
  { value: "NON_HOLO", label: "Non holo" },
  { value: "HOLO", label: "Holo" },
  { value: "REVERSE_HOLO", label: "Reverse holo" },
  { value: "FULL_ART", label: "Full art" },
  { value: "TEXTURED", label: "Texturee" },
  { value: "COSMOS", label: "Cosmos" },
  { value: "CRACKED_ICE", label: "Cracked ice" },
] as const;

const SET_CODE_LABELS: Record<string, string> = {
  BASE1: "Set de Base",
  BASE2: "Jungle",
  BASE3: "Fossile",
  BASE4: "Base Set 2",
  BASE5: "Team Rocket",
  BASEP: "Promos Set de Base",
};

const FORM_LABEL_CLASS = "text-muted-foreground text-xs";
const FORM_INPUT_CLASS =
  "border-0 border-b border-border bg-transparent px-0 shadow-none rounded-none text-sm focus-visible:ring-0 focus-visible:border-b focus-visible:border-ring";

function formatSetLabel(setValue?: string) {
  const raw = String(setValue ?? "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (SET_CODE_LABELS[upper]) {
    return SET_CODE_LABELS[upper];
  }

  if (upper.startsWith("EXP-")) {
    return `Extension ${upper.replace("EXP-", "")}`;
  }

  return raw
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function resolveDisplayedSetNumber(candidateCardNumber?: string | null) {
  const candidate = String(candidateCardNumber ?? "").trim();
  if (candidate) return candidate;
  return "-";
}

type OcrCandidate = {
  cardRefId: string;
  source?: "local" | "tcgdex_fallback";
  category?: string | null;
  name: string;
  set: string;
  setDetails?: {
    cardCount?: {
      official?: number | null;
      total?: number | null;
    };
    id?: string | null;
    logo?: string | null;
    name?: string | null;
    series?: string | null;
    seriesId?: string | null;
    symbol?: string | null;
  } | null;
  variants?: {
    firstEdition?: boolean;
    holo?: boolean;
    normal?: boolean;
    reverse?: boolean;
    wPromo?: boolean;
  } | null;
  tcgId?: string | null;
  cardNumber?: string | null;
  language?: string | null;
  hp?: number | null;
  rarity?: string | null;
  finish?: string | null;
  isSecret?: boolean | null;
  isPromo?: boolean | null;
  vintageHint?: string | null;
  regulationMark?: string | null;
  illustrator?: string | null;
  estimatedCondition?: string | null;
  releaseYear?: number | null;
  imageUrl?: string | null;
  score: number;
};

type OcrParsed = {
  name?: string;
  cardNumber?: string;
  set?: string;
  language?: string;
  hp?: number;
  rarity?: string;
  finish?: string;
  isSecret?: boolean;
  isPromo?: boolean;
  vintageHint?: string;
  regulationMark?: string;
  illustrator?: string;
  estimatedCondition?: (typeof CONDITIONS)[number];
};

function mapGradeToCondition(grade: number) {
  if (grade >= 10) return "MINT";
  if (grade >= 9) return "NEAR_MINT";
  if (grade >= 8) return "EXCELLENT";
  if (grade >= 7) return "GOOD";
  if (grade >= 6) return "LIGHT_PLAYED";
  if (grade >= 4) return "PLAYED";
  return "POOR";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function SellForm() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(1);
  const [isGraded, setIsGraded] = useState(false);
  const [gradeValue, setGradeValue] = useState("10");
  const [titleValue, setTitleValue] = useState("");
  const [priceValue, setPriceValue] = useState("");
  const [conditionValue, setConditionValue] = useState("NEAR_MINT");
  const [gradingCompanyValue, setGradingCompanyValue] = useState("PSA");
  const [cardNameValue, setCardNameValue] = useState("");
  const [cardSetValue, setCardSetValue] = useState("");
  const [cardNumberValue, setCardNumberValue] = useState("");
  const [cardLanguageValue, setCardLanguageValue] = useState<"" | "fr" | "en" | "jp">("");
  const [cardHpValue, setCardHpValue] = useState("");
  const [cardRarityValue, setCardRarityValue] = useState("");
  const [cardFinishValue, setCardFinishValue] = useState("");
  const [hasSubmittedCurrentFlow, setHasSubmittedCurrentFlow] = useState(false);
  const [frontSelected, setFrontSelected] = useState(false);
  const [backSelected, setBackSelected] = useState(false);
  const [cameraSide, setCameraSide] = useState<"front" | "back">("front");
  const [cameraError, setCameraError] = useState("");
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [frontPreviewUrl, setFrontPreviewUrl] = useState<string | null>(null);
  const [backPreviewUrl, setBackPreviewUrl] = useState<string | null>(null);
  const [ocrAttemptId, setOcrAttemptId] = useState("");
  const [ocrSelectedCardRefId, setOcrSelectedCardRefId] = useState("");
  const [matchDecision, setMatchDecision] = useState<"pending" | "matched" | "unmatched">(
    "pending",
  );
  const [ocrCandidates, setOcrCandidates] = useState<OcrCandidate[]>([]);
  const [ocrParsed, setOcrParsed] = useState<OcrParsed | null>(null);
  const [ocrError, setOcrError] = useState("");
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [validatedCandidatePayload, setValidatedCandidatePayload] = useState("");
  const [isCatalogCandidateValidated, setIsCatalogCandidateValidated] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frontPreviewUrlRef = useRef<string | null>(null);
  const backPreviewUrlRef = useRef<string | null>(null);
  const frontInputRef = useRef<HTMLInputElement | null>(null);
  const backInputRef = useRef<HTMLInputElement | null>(null);
  const [state, formAction, isPending] = useActionState(
    createListingAction,
    initialSellFormState,
  );

  const derivedCondition = useMemo(
    () => mapGradeToCondition(Number(gradeValue || 0)),
    [gradeValue],
  );
  const previewPrice = Number(priceValue || 0);
  const effectiveTitleValue = cardNameValue.trim() || titleValue.trim();
  const previewDisplayPrice =
    previewPrice > 0 ? Math.round((previewPrice * 1.05 + 0.7) * 100) / 100 : 0;
  const cardSetOptions = useMemo(() => {
    const base = Object.keys(SET_CODE_LABELS).map((code) => ({
      value: code,
      label: formatSetLabel(code),
    }));
    const current = cardSetValue.trim();
    if (
      current &&
      !base.some((option) => option.value.toLowerCase() === current.toLowerCase())
    ) {
      base.unshift({ value: current, label: formatSetLabel(current) });
    }
    return base;
  }, [cardSetValue]);
  const cardRarityOptions = useMemo(() => {
    const base: Array<{ value: string; label: string }> = [...RARITY_OPTIONS].map((value) => ({
      value,
      label: value.replace(/_/g, " "),
    }));
    const current = cardRarityValue.trim().toUpperCase();
    if (current && !base.some((option) => option.value === current)) {
      base.unshift({ value: current, label: current.replace(/_/g, " ") });
    }
    return base;
  }, [cardRarityValue]);
  const selectedOcrCandidate = useMemo(
    () => ocrCandidates.find((candidate) => candidate.cardRefId === ocrSelectedCardRefId) ?? null,
    [ocrCandidates, ocrSelectedCardRefId],
  );
  const capturedPreviewImages = useMemo(
    () =>
      [
        frontPreviewUrl ? { src: frontPreviewUrl, alt: "Photo capturee recto" } : null,
        backPreviewUrl ? { src: backPreviewUrl, alt: "Photo capturee verso" } : null,
      ].filter((image): image is { src: string; alt: string } => Boolean(image)),
    [frontPreviewUrl, backPreviewUrl],
  );
  const hasResolvedMatchDecision = matchDecision !== "pending";
  const selectedCardRefIdForSubmit = isUuid(ocrSelectedCardRefId) ? ocrSelectedCardRefId : "";

  const steps = [
    { number: 1, label: "Photos" },
    { number: 2, label: "Correspondance" },
    { number: 3, label: "Annonce" },
    { number: 4, label: "Recap" },
  ] as const;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (step !== 1) return;
    let cancelled = false;

    const startCamera = async () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera indisponible sur cet appareil. Utilise l'import galerie.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setCameraError("");
      } catch {
        setCameraError("Impossible d'acceder a la camera. Utilise l'import galerie.");
      }
    };

    void startCamera();
    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [step]);

  useEffect(() => {
    return () => {
      if (capturedPreviewUrl) {
        URL.revokeObjectURL(capturedPreviewUrl);
      }
    };
  }, [capturedPreviewUrl]);

  useEffect(() => {
    frontPreviewUrlRef.current = frontPreviewUrl;
  }, [frontPreviewUrl]);

  useEffect(() => {
    backPreviewUrlRef.current = backPreviewUrl;
  }, [backPreviewUrl]);

  useEffect(() => {
    return () => {
      if (frontPreviewUrlRef.current) URL.revokeObjectURL(frontPreviewUrlRef.current);
      if (backPreviewUrlRef.current) URL.revokeObjectURL(backPreviewUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (step !== 1) return;
    if (capturedPreviewUrl) return;
    const stream = streamRef.current;
    const video = videoRef.current;
    if (!stream || !video) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    void video.play().catch(() => undefined);
  }, [step, capturedPreviewUrl, cameraSide]);

  const prefillFromCapturedPhotos = () => {
    if (!titleValue.trim()) {
      setTitleValue("Carte Pokemon - a verifier");
    }
  };

  const runOcrDetection = async (file: File) => {
    if (isOcrLoading) return;
    setIsOcrLoading(true);
    setMatchDecision("pending");
    setOcrError("");

    const syncOcrSelection = async (attemptId: string, selectedCardRefId: string) => {
      if (!attemptId || !selectedCardRefId) return;
      try {
        await fetch("/api/ocr/card/selection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attemptId, selectedCardRefId }),
        });
      } catch {
        // Best-effort analytics update only.
      }
    };

    try {
      const payload = new FormData();
      payload.set("image", file);

      const response = await fetch("/api/ocr/card", {
        method: "POST",
        body: payload,
      });
      const json = (await response.json()) as {
        error?: string;
        attemptId?: string | null;
        confidence?: number;
        parsed?: OcrParsed;
        candidates?: OcrCandidate[];
      };

      if (!response.ok) {
        setOcrError(json.error ?? "OCR indisponible.");
        return;
      }

      const candidates = Array.isArray(json.candidates) ? json.candidates : [];
      const top = candidates[0];
      const attemptId = json.attemptId ?? "";
      setOcrCandidates(candidates);
      setOcrParsed(json.parsed ?? null);
      setOcrAttemptId(attemptId);

      if (top) {
        setOcrSelectedCardRefId(top.cardRefId);
        setIsCatalogCandidateValidated(false);
        setValidatedCandidatePayload("");
        if (isUuid(top.cardRefId)) {
          void syncOcrSelection(attemptId, top.cardRefId);
        }
      }

    } catch {
      setOcrError("OCR indisponible pour le moment.");
    } finally {
      setIsOcrLoading(false);
    }
  };

  const assignFileToInput = (input: HTMLInputElement | null, file: File) => {
    if (!input) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const updateSidePreview = (side: "front" | "back", file: File | null) => {
    if (side === "front") {
      if (frontPreviewUrl) URL.revokeObjectURL(frontPreviewUrl);
      setFrontPreviewUrl(file ? URL.createObjectURL(file) : null);
      setFrontSelected(Boolean(file));
      return;
    }
    if (backPreviewUrl) URL.revokeObjectURL(backPreviewUrl);
    setBackPreviewUrl(file ? URL.createObjectURL(file) : null);
    setBackSelected(Boolean(file));
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError("Camera non prete.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.92),
    );
    if (!blob) {
      setCameraError("Impossible de capturer la photo.");
      return;
    }

    const filename = `${cameraSide}-${Date.now()}.jpg`;
    const file = new File([blob], filename, { type: "image/jpeg" });
    if (capturedPreviewUrl) {
      URL.revokeObjectURL(capturedPreviewUrl);
    }
    setCapturedFile(file);
    setCapturedPreviewUrl(URL.createObjectURL(file));
  };

  const onRetake = () => {
    if (capturedPreviewUrl) {
      URL.revokeObjectURL(capturedPreviewUrl);
    }
    setCapturedPreviewUrl(null);
    setCapturedFile(null);
  };

  const onValidateCapture = () => {
    if (!capturedFile) return;
    if (cameraSide === "front") {
      assignFileToInput(frontInputRef.current, capturedFile);
      setFrontSelected(true);
      void runOcrDetection(capturedFile);
      setCameraSide("back");
      onRetake();
      return;
    }
    assignFileToInput(backInputRef.current, capturedFile);
    setBackSelected(true);
    prefillFromCapturedPhotos();
    onRetake();
    setStep(2);
  };

  const onCaptureClick = async () => {
    const video = videoRef.current;
    if (!video) {
      setCameraError("Camera non prete.");
      return;
    }
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      await new Promise((resolve) => setTimeout(resolve, 160));
    }
    await capturePhoto();
  };

  const applyCardDetailsFromCandidate = (candidate: OcrCandidate) => {
    setCardNameValue(candidate.name || "");
    setCardSetValue(candidate.set || "");
    setCardNumberValue(candidate.cardNumber || "");
    setCardLanguageValue(
      candidate.language && ["fr", "en", "jp"].includes(candidate.language.toLowerCase())
        ? (candidate.language.toLowerCase() as "fr" | "en" | "jp")
        : "",
    );
    setCardHpValue(candidate.hp ? String(candidate.hp) : "");
    setCardRarityValue(candidate.rarity || "");
    setCardFinishValue(candidate.finish || "");
  };

  const confirmNoCatalogMatch = () => {
    const fallbackCandidate = ocrCandidates[0] ?? null;
    const name = ocrParsed?.name || fallbackCandidate?.name || "";
    const setValue = ocrParsed?.set || fallbackCandidate?.set || "";
    const numberValue = ocrParsed?.cardNumber || fallbackCandidate?.cardNumber || "";
    const languageValue =
      ocrParsed?.language || fallbackCandidate?.language || "";
    const hpValue =
      ocrParsed?.hp !== undefined
        ? String(ocrParsed.hp)
        : fallbackCandidate?.hp !== undefined && fallbackCandidate?.hp !== null
          ? String(fallbackCandidate.hp)
          : "";
    const rarityValue = ocrParsed?.rarity || fallbackCandidate?.rarity || "";
    const finishValue = ocrParsed?.finish || fallbackCandidate?.finish || "";

    setMatchDecision("unmatched");
    setOcrSelectedCardRefId("");
    setTitleValue(name);
    setCardNameValue(name);
    setCardSetValue(setValue);
    setCardNumberValue(numberValue);
    setCardLanguageValue(
      languageValue && ["fr", "en", "jp"].includes(languageValue.toLowerCase())
        ? (languageValue.toLowerCase() as "fr" | "en" | "jp")
        : "",
    );
    setCardHpValue(hpValue);
    setCardRarityValue(rarityValue);
    setCardFinishValue(finishValue);
    setHasSubmittedCurrentFlow(false);
    setIsCatalogCandidateValidated(false);
    setValidatedCandidatePayload("");
    setStep((current) => Math.min(4, current + 1));
  };

  const confirmCatalogCandidate = () => {
    if (!selectedOcrCandidate) return;
    setMatchDecision("matched");
    setTitleValue(selectedOcrCandidate.name || "");
    if (!isGraded && selectedOcrCandidate.estimatedCondition) {
      setConditionValue(selectedOcrCandidate.estimatedCondition);
    }
    applyCardDetailsFromCandidate(selectedOcrCandidate);
    setIsCatalogCandidateValidated(true);
    setValidatedCandidatePayload(
      JSON.stringify({
        source: selectedOcrCandidate.source ?? "local",
        category: selectedOcrCandidate.category ?? null,
        tcgId: selectedOcrCandidate.tcgId ?? null,
        name: selectedOcrCandidate.name,
        setId: selectedOcrCandidate.set,
        set: selectedOcrCandidate.setDetails ?? null,
        variants: selectedOcrCandidate.variants ?? null,
        localId: selectedOcrCandidate.cardNumber ?? null,
        language: selectedOcrCandidate.language ?? null,
        hp: selectedOcrCandidate.hp ?? null,
        rarity: selectedOcrCandidate.rarity ?? null,
        finish: selectedOcrCandidate.finish ?? null,
        regulationMark: selectedOcrCandidate.regulationMark ?? null,
        illustrator: selectedOcrCandidate.illustrator ?? null,
        releaseYear: selectedOcrCandidate.releaseYear ?? null,
        image: selectedOcrCandidate.imageUrl ?? null,
      }),
    );
    setHasSubmittedCurrentFlow(false);
    setStep((current) => Math.min(4, current + 1));
  };

  const canGoNext =
    step === 1
      ? frontSelected && backSelected
      : step === 2
        ? hasResolvedMatchDecision &&
          (matchDecision === "unmatched" || Boolean(selectedOcrCandidate))
        : step === 3
          ? effectiveTitleValue.length >= 3 &&
            Number.isFinite(previewPrice) &&
            previewPrice > 0
          : true;

  return (
    <section className="space-y-4">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          {step > 1 ? (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-9 w-9"
              onClick={() => setStep((current) => Math.max(1, current - 1))}
              aria-label="Etape precedente"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          ) : null}
          <h1 className="text-2xl font-semibold">Creation d&apos;annonce</h1>
        </div>
        <ol className="hide-scrollbar flex items-start justify-center gap-1 overflow-x-auto pb-1">
          {steps.map((item) => {
            const active = step === item.number;
            const done = step > item.number;
            return (
              <li key={item.number} className="flex items-start">
                <div className="flex min-w-16 flex-col items-center gap-1 text-xs">
                  <span
                    className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                      done
                        ? "border-primary bg-primary text-primary-foreground"
                        : active
                          ? "border-primary text-primary"
                          : "text-muted-foreground border-border"
                    }`}
                  >
                    {item.number}
                  </span>
                  <span className={active ? "font-medium" : "text-muted-foreground"}>
                    {item.label}
                  </span>
                </div>
                {item.number < steps.length ? (
                  <span
                    className={`mt-3 mx-1 h-px w-5 ${
                      step > item.number ? "bg-primary/70" : "bg-border"
                    }`}
                    aria-hidden="true"
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </header>
      <div>
        <form
          id="sell-form"
          action={formAction}
          className={`space-y-4 ${step === 1 ? "" : "pb-24 md:pb-0"}`}
          onSubmit={(event) => {
            if (step < 4) {
              event.preventDefault();
              setHasSubmittedCurrentFlow(false);
              return;
            }
            setHasSubmittedCurrentFlow(true);
          }}
        >
          <input type="hidden" name="is_graded" value={isGraded ? "on" : ""} />
          <input type="hidden" name="title" value={effectiveTitleValue} />
          <input type="hidden" name="price_seller" value={priceValue} />
          <input type="hidden" name="condition" value={conditionValue} />
          <input type="hidden" name="grading_company" value={gradingCompanyValue} />
          <input type="hidden" name="grade_note" value={gradeValue} />
          <input type="hidden" name="delivery_weight_class" value="S" />
          <input type="hidden" name="card_ref_id" value={selectedCardRefIdForSubmit} />
          <input type="hidden" name="ocr_attempt_id" value={ocrAttemptId} />
          <input type="hidden" name="selected_candidate_payload" value={validatedCandidatePayload} />
          <input type="hidden" name="is_catalog_candidate_validated" value={isCatalogCandidateValidated ? "1" : "0"} />
          <input type="hidden" name="card_name" value={cardNameValue} />
          <input type="hidden" name="card_set" value={cardSetValue} />
          <input type="hidden" name="card_number" value={cardNumberValue} />
          <input type="hidden" name="card_language" value={cardLanguageValue} />
          <input type="hidden" name="card_hp" value={cardHpValue} />
          <input type="hidden" name="card_rarity" value={cardRarityValue} />
          <input type="hidden" name="card_finish" value={cardFinishValue} />
          <div className="hidden">
            <input
              ref={frontInputRef}
              id="front_image"
              name="front_image"
              type="file"
              accept="image/*"
              capture="environment"
              required
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                updateSidePreview("front", file);
              }}
            />
            <input
              ref={backInputRef}
              id="back_image"
              name="back_image"
              type="file"
              accept="image/*"
              capture="environment"
              required
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                updateSidePreview("back", file);
              }}
            />
          </div>

          {step === 2 ? (
            <>
              <div className="min-h-[calc(100dvh-15rem)] space-y-3">
                {ocrError ? (
                  <p className="text-destructive text-xs">{ocrError}</p>
                ) : null}
                {isOcrLoading ? (
                  <div className="h-[calc(100dvh-20rem)] min-h-[500px] space-y-2">
                    <div className="hide-scrollbar flex h-full snap-x gap-3 overflow-x-auto pb-1">
                      {[0, 1].map((idx) => (
                        <div
                          key={idx}
                          className="bg-background w-[min(85vw,360px)] shrink-0 snap-start overflow-hidden rounded-md border"
                        >
                          <div className="relative aspect-[63/88] w-full">
                            <Skeleton className="h-full w-full" />
                          </div>
                          <div className="space-y-2 p-3">
                            <Skeleton className="h-4 w-2/3" />
                            <Skeleton className="h-3 w-1/2" />
                            <div className="grid grid-cols-2 gap-2 pt-2">
                              <Skeleton className="h-3 w-full" />
                              <Skeleton className="h-3 w-full" />
                              <Skeleton className="h-3 w-full" />
                              <Skeleton className="h-3 w-full" />
                              <Skeleton className="h-3 w-full" />
                              <Skeleton className="h-3 w-full" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : ocrCandidates.length > 0 ? (
                  <div className="h-[calc(100dvh-20rem)] min-h-[500px] space-y-2">
                    <div className="hide-scrollbar flex h-full snap-x gap-3 overflow-x-auto pb-1">
                      {ocrCandidates.map((candidate) => (
                        <button
                          key={candidate.cardRefId}
                          type="button"
                          className={`w-[min(85vw,360px)] h-full shrink-0 snap-start overflow-hidden rounded-md border text-left transition flex flex-col ${
                            ocrSelectedCardRefId === candidate.cardRefId
                              ? "border-primary bg-primary/5 ring-primary/30 ring-2"
                              : "border-border"
                          }`}
                          onClick={() => {
                            setOcrSelectedCardRefId(candidate.cardRefId);
                            setMatchDecision("matched");
                            setIsCatalogCandidateValidated(false);
                            setValidatedCandidatePayload("");
                            if (ocrAttemptId && isUuid(candidate.cardRefId)) {
                              void fetch("/api/ocr/card/selection", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  attemptId: ocrAttemptId,
                                  selectedCardRefId: candidate.cardRefId,
                                }),
                              }).catch(() => undefined);
                            }
                          }}
                        >
                          <div className="bg-muted relative aspect-[63/88] w-2/3 shrink-0 self-center rounded-sm">
                            <span className="bg-background/90 text-foreground absolute top-2 right-2 z-10 rounded-full px-2 py-0.5 text-[11px] font-medium">
                              {Math.round(candidate.score * 100)}% correspondance
                            </span>
                            {ocrSelectedCardRefId === candidate.cardRefId ? (
                              <span className="bg-primary/90 text-primary-foreground absolute top-2 left-2 z-10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Selectionnee
                              </span>
                            ) : null}
                            {candidate.imageUrl ? (
                              <Image
                                src={candidate.imageUrl}
                                alt={candidate.name}
                                fill
                                unoptimized
                                className="object-contain"
                              />
                            ) : null}
                          </div>
                          <div className="flex-1 space-y-3 overflow-y-auto p-3">
                            <h3 className="line-clamp-2 text-lg font-semibold tracking-tight">
                              {candidate.name}
                            </h3>

                            <section className="space-y-2">
                              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                                <div>
                                  <p className="text-muted-foreground text-xs">Bloc</p>
                                  <p className="text-sm">
                                    {candidate.setDetails?.name ||
                                      formatSetLabel(candidate.set) ||
                                      "-"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground text-xs">Set number</p>
                                  <p className="text-sm">
                                    {resolveDisplayedSetNumber(candidate.cardNumber)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground text-xs">Serie</p>
                                  <p className="text-sm">
                                    {candidate.setDetails?.series ||
                                      candidate.setDetails?.seriesId ||
                                      "-"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground text-xs">Langue</p>
                                  <p className="text-sm">
                                    {candidate.language ? candidate.language.toUpperCase() : "-"}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground text-xs">Rarete</p>
                                  <p className="text-sm">{candidate.rarity || "-"}</p>
                                </div>
                                <div>
                                  <p className="text-muted-foreground text-xs">Version</p>
                                  <p className="text-sm">{candidate.finish || "-"}</p>
                                </div>
                                <div className="col-span-2">
                                  <p className="text-muted-foreground text-xs">Illustrateur</p>
                                  <p className="text-sm">{candidate.illustrator || "-"}</p>
                                </div>
                              </div>
                            </section>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Aucune proposition fiable du catalogue.
                  </p>
                )}

              </div>
            </>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <section className="space-y-3 border-b pb-4">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Identification carte
                </p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="card_name" className={FORM_LABEL_CLASS}>
                      Nom de la carte
                    </Label>
                    <Input
                      id="card_name"
                      placeholder="Ex: Dracaufeu"
                      value={cardNameValue}
                      onChange={(event) => setCardNameValue(event.target.value)}
                      className={FORM_INPUT_CLASS}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="card_set" className={FORM_LABEL_CLASS}>
                      Set / Extension
                    </Label>
                    <Select
                      value={cardSetValue || undefined}
                      onValueChange={setCardSetValue}
                    >
                      <SelectTrigger id="card_set" className={`w-full ${FORM_INPUT_CLASS}`}>
                        <SelectValue placeholder="Choisir un set" />
                      </SelectTrigger>
                      <SelectContent>
                        {cardSetOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="card_number" className={FORM_LABEL_CLASS}>
                      Numero
                    </Label>
                    <Input
                      id="card_number"
                      placeholder="Ex: 10/102"
                      value={cardNumberValue}
                      onChange={(event) => setCardNumberValue(event.target.value)}
                      className={FORM_INPUT_CLASS}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="card_language" className={FORM_LABEL_CLASS}>
                      Langue
                    </Label>
                    <Select
                      value={cardLanguageValue || undefined}
                      onValueChange={(value) =>
                        setCardLanguageValue(value as "" | "fr" | "en" | "jp")
                      }
                    >
                      <SelectTrigger id="card_language" className={`w-full ${FORM_INPUT_CLASS}`}>
                        <SelectValue placeholder="Choisir une langue" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fr">FR</SelectItem>
                        <SelectItem value="en">EN</SelectItem>
                        <SelectItem value="jp">JP</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="card_hp" className={FORM_LABEL_CLASS}>
                      HP
                    </Label>
                    <Input
                      id="card_hp"
                      type="number"
                      min="0"
                      placeholder="Ex: 60"
                      value={cardHpValue}
                      onChange={(event) => setCardHpValue(event.target.value)}
                      className={FORM_INPUT_CLASS}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="card_rarity" className={FORM_LABEL_CLASS}>
                      Rarete
                    </Label>
                    <Select
                      value={cardRarityValue || undefined}
                      onValueChange={setCardRarityValue}
                    >
                      <SelectTrigger id="card_rarity" className={`w-full ${FORM_INPUT_CLASS}`}>
                        <SelectValue placeholder="Choisir une rarete" />
                      </SelectTrigger>
                      <SelectContent>
                        {cardRarityOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="card_finish" className={FORM_LABEL_CLASS}>
                      Finition
                    </Label>
                    <Select
                      value={cardFinishValue || undefined}
                      onValueChange={setCardFinishValue}
                    >
                      <SelectTrigger id="card_finish" className={`w-full ${FORM_INPUT_CLASS}`}>
                        <SelectValue placeholder="Choisir une finition" />
                      </SelectTrigger>
                      <SelectContent>
                        {FINISH_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </section>

              <section className="space-y-3 border-b pb-4">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Etat et gradation
                </p>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox
                    id="is_graded"
                    checked={isGraded}
                    onCheckedChange={(checked) => setIsGraded(Boolean(checked))}
                  />
                  <Label htmlFor="is_graded">Carte gradee</Label>
                </div>

                {isGraded ? (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="grading_company" className={FORM_LABEL_CLASS}>
                        Societe
                      </Label>
                      <Select
                        value={gradingCompanyValue}
                        onValueChange={setGradingCompanyValue}
                        required={isGraded}
                      >
                        <SelectTrigger id="grading_company" className={`w-full ${FORM_INPUT_CLASS}`}>
                          <SelectValue placeholder="Choisir une societe" />
                        </SelectTrigger>
                        <SelectContent>
                          {GRADING_COMPANIES.map((company) => (
                            <SelectItem key={company} value={company}>
                              {company}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="grade_note" className={FORM_LABEL_CLASS}>
                        Note (1 a 10)
                      </Label>
                      <Input
                        id="grade_note"
                        type="number"
                        min="1"
                        max="10"
                        step="0.5"
                        required={isGraded}
                        value={gradeValue}
                        onChange={(event) => setGradeValue(event.target.value)}
                        className={FORM_INPUT_CLASS}
                      />
                      <p className="text-xs text-muted-foreground">
                        Etat calcule automatiquement:{" "}
                        <span className="font-medium">{formatConditionLabel(derivedCondition)}</span>
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="condition" className={FORM_LABEL_CLASS}>
                      Etat
                    </Label>
                    <Select
                      value={conditionValue}
                      onValueChange={setConditionValue}
                      required={!isGraded}
                    >
                      <SelectTrigger id="condition" className={`w-full ${FORM_INPUT_CLASS}`}>
                        <SelectValue placeholder="Choisir un etat" />
                      </SelectTrigger>
                      <SelectContent>
                        {CONDITIONS.map((condition) => (
                          <SelectItem key={condition} value={condition}>
                            {formatConditionLabel(condition)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                  Prix et livraison
                </p>
                <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price_seller" className={FORM_LABEL_CLASS}>
                    Prix net vendeur (EUR)
                  </Label>
                  <Input
                    id="price_seller"
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="20.00"
                    required
                    value={priceValue}
                    onChange={(event) => setPriceValue(event.target.value)}
                    className={FORM_INPUT_CLASS}
                  />
                  <p className="text-xs text-muted-foreground">
                    Prix estime affiche: {previewDisplayPrice.toFixed(2)} EUR (hors livraison).
                  </p>
                </div>
                </div>
              </section>
            </div>
          ) : null}

          <div className={`${step === 1 ? "hidden" : ""}`}>
            {step < 4 ? (
              <>
                <div className="hidden md:block">
                  {step === 2 ? (
                    <div className="flex w-full flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={confirmNoCatalogMatch}>
                        Je ne trouve pas ma carte
                      </Button>
                      <Button
                        type="button"
                        disabled={isPending || !canGoNext}
                        onClick={confirmCatalogCandidate}
                        className="w-full text-base md:w-auto md:text-sm"
                      >
                        Valider cette carte
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      disabled={isPending || !canGoNext}
                      onClick={() => {
                        setHasSubmittedCurrentFlow(false);
                        setStep((current) => Math.min(4, current + 1));
                      }}
                      className="w-full text-base md:w-auto md:text-sm"
                    >
                      Etape suivante
                    </Button>
                  )}
                </div>
                <div className="fixed inset-x-0 bottom-[max(0.75rem,var(--safe-area-bottom))] z-40 px-4 md:hidden">
                  {step === 2 ? (
                    <div className="grid grid-cols-1 gap-2">
                      <Button
                        type="button"
                        disabled={isPending || !canGoNext}
                        onClick={confirmCatalogCandidate}
                        className="h-12 text-base shadow-lg"
                      >
                        Valider cette carte
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={confirmNoCatalogMatch}
                        className="h-12"
                      >
                        Je ne trouve pas ma carte
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      disabled={isPending || !canGoNext}
                      onClick={() => {
                        setHasSubmittedCurrentFlow(false);
                        setStep((current) => Math.min(4, current + 1));
                      }}
                      className="h-12 w-full text-base shadow-lg"
                    >
                      Etape suivante
                    </Button>
                  )}
                </div>
              </>
            ) : (
              null
            )}
          </div>
        </form>

        {hasSubmittedCurrentFlow && state.status !== "idle" ? (
          <div
            className={`mt-4 rounded-md border p-3 text-sm ${
              state.status === "success"
                ? "border-primary/40 bg-primary/10"
                : "border-destructive/40 bg-destructive/10"
            }`}
          >
            <p>{state.message}</p>
            {state.status === "success" && state.listingId ? (
              <p className="mt-2">
                ID annonce: <span className="font-medium">{state.listingId}</span>
              </p>
            ) : null}
            {state.status === "success" ? (
              <Button asChild variant="link" className="mt-1 h-auto p-0">
                <Link href="/profile">Voir mon profil</Link>
              </Button>
            ) : null}
          </div>
        ) : null}

        {hasSubmittedCurrentFlow && isPending ? (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 backdrop-blur-[2px]">
            <div className="bg-background text-foreground flex items-center gap-3 rounded-md border px-4 py-3 shadow-lg">
              <span className="border-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" />
              <p className="text-sm font-medium">Publication en cours...</p>
            </div>
          </div>
        ) : null}
      </div>
      {step === 1 && mounted
        ? createPortal(
            <div className="fixed inset-0 z-[100] bg-black text-white">
              {capturedPreviewUrl ? (
                <Image
                  src={capturedPreviewUrl}
                  alt={`Preview ${cameraSide === "front" ? "recto" : "verso"}`}
                  fill
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <video
                  ref={videoRef}
                  className="h-full w-full object-cover"
                  autoPlay
                  muted
                  playsInline
                />
              )}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-[min(94vw,calc((100dvh-11rem)*63/88))] aspect-[63/88] rounded-md border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
              </div>

              <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-4 pt-6 pb-4">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="h-9 w-9 border-white/40 bg-black/35 text-white hover:bg-black/55 hover:text-white"
                  onClick={() => {
                    if (capturedPreviewUrl) {
                      onRetake();
                      return;
                    }
                    router.back();
                  }}
                  aria-label="Retour"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex flex-col items-center gap-1.5">
                  <p className="text-center text-xs text-white/90">
                    Prenez en photo la carte que vous souhaitez vendre.
                  </p>
                  <div className="rounded-md border border-white/30 bg-black/35 px-2 py-1 text-xs font-medium">
                    {cameraSide === "front" ? "RECTO" : "VERSO"}
                  </div>
                </div>
                <div className="h-9 w-9" />
              </div>

              <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-4 pb-[max(1rem,var(--safe-area-bottom))] pt-10">
                {cameraError ? (
                  <p className="text-destructive text-xs">{cameraError}</p>
                ) : null}
                {capturedPreviewUrl ? (
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="bg-black/30 text-white hover:bg-black/45 hover:text-white"
                      onClick={onRetake}
                    >
                      Reprendre
                    </Button>
                    <Button type="button" onClick={onValidateCapture}>
                      Valider
                    </Button>
                  </div>
                ) : (
                  <div className="flex justify-center">
                    <Button
                      type="button"
                      onClick={() => void onCaptureClick()}
                      size="icon"
                      className="h-16 w-16 rounded-full border-4 border-white bg-white/95 text-black hover:bg-white"
                    >
                      <Camera className="h-12 w-12" />
                    </Button>
                  </div>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
      {step === 4 && mounted
        ? createPortal(
            <div className="fixed inset-0 z-[110] bg-background">
              <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-4 pt-5 pb-[max(1rem,var(--safe-area-bottom))] md:px-6">
                <header className="mb-4 flex items-center gap-2">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9"
                    onClick={() => setStep(3)}
                    aria-label="Retour aux details"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <h2 className="text-lg font-semibold">Recapitulatif de l&apos;annonce</h2>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  <section className="space-y-4">
                    <div className="grid gap-4 lg:grid-cols-3">
                      <div className="space-y-3 lg:col-span-2">
                        <div className="mx-auto w-1/2 overflow-hidden rounded-md">
                          <ListingImageCarousel images={capturedPreviewImages} />
                        </div>
                      </div>

                      <aside className="space-y-4">
                        <h3 className="text-2xl font-bold tracking-tight">
                          {effectiveTitleValue || "Titre a renseigner"}
                        </h3>
                        <div>
                          <p className="text-xl font-bold tracking-tight">
                            {previewDisplayPrice > 0
                              ? `${previewDisplayPrice.toFixed(2)} EUR`
                              : "Prix a renseigner"}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            Hors frais de port. Livraison calculee au checkout.
                          </p>
                        </div>
                        <div className="text-sm">
                          <p>
                            <span className="font-medium">Etat:</span>{" "}
                            {isGraded
                              ? formatConditionLabel(derivedCondition)
                              : formatConditionLabel(conditionValue)}
                          </p>
                          <p>
                            <span className="font-medium">Mode:</span>{" "}
                            {isGraded ? "Carte gradee" : "Carte non gradee"}
                          </p>
                        </div>
                        {cardNameValue ||
                        cardSetValue ||
                        cardNumberValue ||
                        cardLanguageValue ||
                        cardHpValue ||
                        cardRarityValue ||
                        cardFinishValue ||
                        selectedOcrCandidate ? (
                          <div className="space-y-2 border-t pt-3 text-sm">
                            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                              Identification carte
                            </p>
                            <div className="grid grid-cols-1 gap-1">
                              <p>
                                Nom: {cardNameValue || selectedOcrCandidate?.name || "-"}
                              </p>
                              <p>
                                Set:{" "}
                                {formatSetLabel(cardSetValue || selectedOcrCandidate?.set)}
                              </p>
                              <p>
                                Numero: {cardNumberValue || selectedOcrCandidate?.cardNumber || "-"}
                              </p>
                              <p>
                                Langue:{" "}
                                {(cardLanguageValue || selectedOcrCandidate?.language || "-").toUpperCase()}
                              </p>
                              <p>HP: {cardHpValue || selectedOcrCandidate?.hp || "-"}</p>
                              <p>
                                Rarete: {cardRarityValue || selectedOcrCandidate?.rarity || "-"} ·
                                Finition: {cardFinishValue || selectedOcrCandidate?.finish || "-"}
                              </p>
                              <p>
                                Ref:{" "}
                                {selectedOcrCandidate
                                  ? selectedOcrCandidate.tcgId || selectedOcrCandidate.cardRefId
                                  : "Reference manuelle"}
                              </p>
                            </div>
                          </div>
                        ) : null}
                      </aside>
                    </div>
                  </section>
                </div>

                <div className="mt-3 shrink-0 border-t bg-background/95 pt-3 backdrop-blur">
                  <Button
                    type="submit"
                    form="sell-form"
                    disabled={isPending}
                    className="h-12 w-full text-base shadow-lg"
                  >
                    {isPending ? "Publication..." : "Publier"}
                  </Button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
