"use client";

import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Camera, Check } from "lucide-react";
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

function resolveDisplayedSetNumber(params: {
  candidateCardNumber?: string | null;
  localId?: string | null;
  official?: number | null;
}) {
  const localId = String(params.localId ?? "").trim();
  const official = params.official ?? null;
  if (localId) {
    if (typeof official === "number" && Number.isFinite(official) && official > 0) {
      return `${localId}/${official}`;
    }
    return localId;
  }

  const candidate = String(params.candidateCardNumber ?? "").trim();
  if (candidate) return candidate;
  return "-";
}

function resolveDisplayedCardNumberForInput(params: {
  localId?: string | null;
  official?: number | null;
  fallback?: string | null;
}) {
  const localId = String(params.localId ?? "").trim();
  const official = params.official ?? null;
  if (localId) {
    if (typeof official === "number" && Number.isFinite(official) && official > 0) {
      return `${localId}/${official}`;
    }
    return localId;
  }
  const fallback = String(params.fallback ?? "").trim();
  return fallback;
}

function resolveCandidateBlockValue(candidate: OcrCandidate) {
  const serieName = String(candidate.setDetails?.serie?.name ?? "").trim();
  if (serieName) return serieName;
  const series = String(candidate.setDetails?.series ?? "").trim();
  if (series) return series;
  const setId = String(candidate.setDetails?.id ?? "").trim();
  if (setId) return setId;
  const seriesId = String(candidate.setDetails?.seriesId ?? "").trim();
  if (seriesId) return seriesId;
  return String(candidate.set ?? "").trim();
}

function resolveCandidateSeriesValue(candidate: OcrCandidate) {
  const setName = String(candidate.setDetails?.name ?? "").trim();
  if (setName) return setName;
  return formatSetLabel(candidate.set);
}

function isValidCardNumberFormat(value: string) {
  const normalized = value.trim();
  if (!normalized) return true;
  return /^[A-Za-z0-9]+(?:\/\d{1,3})?$/.test(normalized);
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
    serie?: {
      id?: string | null;
      name?: string | null;
    } | null;
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

type CardFieldSuggestions = {
  names: string[];
  sets: string[];
  numbers: string[];
  languages: string[];
  rarities: string[];
  finishes: string[];
  hps: string[];
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
  const [cardSeriesValue, setCardSeriesValue] = useState("");
  const [cardSetValue, setCardSetValue] = useState("");
  const [cardNumberValue, setCardNumberValue] = useState("");
  const [cardLanguageValue, setCardLanguageValue] = useState<"" | "fr" | "en" | "jp">("");
  const [cardLanguageInputValue, setCardLanguageInputValue] = useState("");
  const [cardRarityValue, setCardRarityValue] = useState("");
  const [cardFinishValue, setCardFinishValue] = useState("");
  const [autoDetectedFields, setAutoDetectedFields] = useState({
    name: false,
    series: false,
    block: false,
    number: false,
    language: false,
    rarity: false,
    version: false,
  });
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
  const [hasOcrResult, setHasOcrResult] = useState(false);
  const [validatedCandidatePayload, setValidatedCandidatePayload] = useState("");
  const [isCatalogCandidateValidated, setIsCatalogCandidateValidated] = useState(false);
  const [cardFieldSuggestions, setCardFieldSuggestions] = useState<CardFieldSuggestions>({
    names: [],
    sets: [],
    numbers: [],
    languages: ["FR", "EN", "JP"],
    rarities: [],
    finishes: [],
    hps: [],
  });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frontPreviewUrlRef = useRef<string | null>(null);
  const backPreviewUrlRef = useRef<string | null>(null);
  const frontFileRef = useRef<File | null>(null);
  const backFileRef = useRef<File | null>(null);
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
  const previewDisplayPrice = previewPrice > 0 ? Math.round(previewPrice * 100) / 100 : 0;
  const previewSellerNet =
    previewDisplayPrice > 0
      ? Math.max(0, Math.round(((previewDisplayPrice - 0.7) / 1.05) * 100) / 100)
      : 0;
  const selectedOcrCandidate = useMemo(
    () => {
      const bestCandidate =
        ocrCandidates.length > 0
          ? [...ocrCandidates].sort((a, b) => b.score - a.score)[0] ?? null
          : null;
      if (!bestCandidate) return null;
      return (
        ocrCandidates.find((candidate) => candidate.cardRefId === ocrSelectedCardRefId) ??
        bestCandidate
      );
    },
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
  const selectedCardRefIdForSubmit = String(ocrSelectedCardRefId ?? "").trim();
  const cardNumberError = isValidCardNumberFormat(cardNumberValue)
    ? ""
    : "Format invalide. Exemple attendu: 62/147 ou 62.";
  const cardLanguageError =
    cardLanguageInputValue.trim().length > 0 && !cardLanguageValue
      ? "Langue invalide. Utilise FR, EN ou JP."
      : "";

  const steps = [
    { number: 1, label: "Photos" },
    { number: 2, label: "Correspondance" },
    { number: 3, label: "Annonce" },
    { number: 4, label: "Recap" },
  ] as const;

  const cameraSteps = [
    { key: "front", label: "Recto" },
    { key: "back", label: "Verso" },
  ] as const;

  const renderAutoDetectedBadge = (active: boolean) =>
    active ? (
      <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
        Detecte automatiquement
      </span>
    ) : null;

  const getActionableErrorHint = (message: string) => {
    const normalized = message.toLowerCase();
    if (normalized.includes("upload")) return "Retente l'upload des photos et verifie ta connexion.";
    if (normalized.includes("prix")) return "Corrige le prix puis reessaie.";
    if (normalized.includes("session")) return "Reconnecte-toi puis relance la publication.";
    return "Reessaie. Si le probleme persiste, recharge la page.";
  };

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (step !== 3) return;
    let cancelled = false;
    const q = cardNameValue.trim();
    const timer = window.setTimeout(async () => {
      try {
        const search = q ? `?q=${encodeURIComponent(q)}` : "";
        const response = await fetch(`/api/cards/suggestions${search}`, { cache: "no-store" });
        if (!response.ok) return;
        const json = (await response.json()) as {
          suggestions?: Partial<CardFieldSuggestions>;
        };
        if (cancelled) return;
        setCardFieldSuggestions((previous) => ({
          names: json.suggestions?.names ?? previous.names,
          sets: json.suggestions?.sets ?? previous.sets,
          numbers: json.suggestions?.numbers ?? previous.numbers,
          languages:
            json.suggestions?.languages && json.suggestions.languages.length > 0
              ? json.suggestions.languages
              : previous.languages,
          rarities: json.suggestions?.rarities ?? previous.rarities,
          finishes: json.suggestions?.finishes ?? previous.finishes,
          hps: json.suggestions?.hps ?? previous.hps,
        }));
      } catch {
        // Best effort suggestions only.
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [step, cardNameValue]);

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

  useEffect(() => {
    if (step !== 2) return;
    if (ocrCandidates.length === 0) return;
    if (ocrSelectedCardRefId) return;
    const bestCandidate = [...ocrCandidates].sort((a, b) => b.score - a.score)[0];
    if (!bestCandidate) return;
    setOcrSelectedCardRefId(bestCandidate.cardRefId);
    setMatchDecision("matched");
  }, [step, ocrCandidates, ocrSelectedCardRefId]);

  useEffect(() => {
    if (step !== 2) return;
    if (!ocrAttemptId || !ocrSelectedCardRefId) return;
    void fetch("/api/ocr/card/selection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId: ocrAttemptId,
        selectedCardRefId: ocrSelectedCardRefId,
      }),
    }).catch(() => undefined);
  }, [step, ocrAttemptId, ocrSelectedCardRefId]);

  const prefillFromCapturedPhotos = () => {
    if (!titleValue.trim()) {
      setTitleValue("Carte Pokemon - a verifier");
    }
  };

  const runOcrDetection = async (file: File) => {
    if (isOcrLoading) return;
    setIsOcrLoading(true);
    setHasOcrResult(false);
    setMatchDecision("pending");
    setOcrSelectedCardRefId("");
    setIsCatalogCandidateValidated(false);
    setValidatedCandidatePayload("");
    setOcrError("");
    setAutoDetectedFields({
      name: false,
      series: false,
      block: false,
      number: false,
      language: false,
      rarity: false,
      version: false,
    });

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
        setHasOcrResult(true);
        return;
      }

      const candidates = Array.isArray(json.candidates) ? json.candidates : [];
      const attemptId = json.attemptId ?? "";
      setOcrCandidates(candidates);
      setOcrParsed(json.parsed ?? null);
      setOcrAttemptId(attemptId);
      setHasOcrResult(true);

    } catch {
      setOcrError("OCR indisponible pour le moment.");
      setHasOcrResult(true);
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
      frontFileRef.current = file;
      if (frontPreviewUrl) URL.revokeObjectURL(frontPreviewUrl);
      setFrontPreviewUrl(file ? URL.createObjectURL(file) : null);
      setFrontSelected(Boolean(file));
      return;
    }
    backFileRef.current = file;
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

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const remSize =
      Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
    const guideHeightReference = Math.max(0, viewportHeight - 11 * remSize);
    const guideWidth = Math.min(viewportWidth * 0.94, (guideHeightReference * 63) / 88);
    const guideHeight = (guideWidth * 88) / 63;
    const guideLeft = (viewportWidth - guideWidth) / 2;
    const guideTop = (viewportHeight - guideHeight) / 2;

    // Preview is rendered with object-cover over the full viewport.
    // Convert guide box (viewport coords) to source video pixels.
    const scale = Math.max(viewportWidth / video.videoWidth, viewportHeight / video.videoHeight);
    const displayedVideoWidth = video.videoWidth * scale;
    const displayedVideoHeight = video.videoHeight * scale;
    const offsetX = (viewportWidth - displayedVideoWidth) / 2;
    const offsetY = (viewportHeight - displayedVideoHeight) / 2;
    const sourceLeft = Math.max(0, Math.round((guideLeft - offsetX) / scale));
    const sourceTop = Math.max(0, Math.round((guideTop - offsetY) / scale));
    const sourceWidth = Math.max(1, Math.round(guideWidth / scale));
    const sourceHeight = Math.max(1, Math.round(guideHeight / scale));
    const clampedSourceWidth = Math.min(sourceWidth, video.videoWidth - sourceLeft);
    const clampedSourceHeight = Math.min(sourceHeight, video.videoHeight - sourceTop);

    const canvas = document.createElement("canvas");
    canvas.width = clampedSourceWidth;
    canvas.height = clampedSourceHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(
      video,
      sourceLeft,
      sourceTop,
      clampedSourceWidth,
      clampedSourceHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );

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

  const restartPhotoFlowForRetry = () => {
    if (capturedPreviewUrl) {
      URL.revokeObjectURL(capturedPreviewUrl);
    }
    setCapturedPreviewUrl(null);
    setCapturedFile(null);
    setCameraSide("front");
    setFrontSelected(false);
    setBackSelected(false);
    updateSidePreview("front", null);
    updateSidePreview("back", null);

    setHasOcrResult(false);
    setIsOcrLoading(false);
    setOcrError("");
    setOcrCandidates([]);
    setOcrParsed(null);
    setOcrAttemptId("");
    setOcrSelectedCardRefId("");
    setMatchDecision("pending");
    setIsCatalogCandidateValidated(false);
    setValidatedCandidatePayload("");
    setStep(1);
  };

  const applyCardDetailsFromCandidate = (candidate: OcrCandidate) => {
    const nextLanguage =
      candidate.language && ["fr", "en", "jp"].includes(candidate.language.toLowerCase())
        ? (candidate.language.toLowerCase() as "fr" | "en" | "jp")
        : "";
    const nextSeries = resolveCandidateSeriesValue(candidate);
    const nextBlock = resolveCandidateBlockValue(candidate);
    const nextNumber = resolveDisplayedCardNumberForInput({
      localId: candidate.cardNumber,
      official: candidate.setDetails?.cardCount?.official,
      fallback: candidate.cardNumber,
    });
    const nextRarity = candidate.rarity || "";
    const nextVersion = candidate.finish || "";

    setCardNameValue(candidate.name || "");
    setCardSeriesValue(nextSeries);
    setCardSetValue(nextBlock);
    setCardNumberValue(nextNumber);
    setCardLanguageValue(nextLanguage);
    setCardLanguageInputValue(nextLanguage.toUpperCase());
    setCardRarityValue(nextRarity);
    setCardFinishValue(nextVersion);
    setAutoDetectedFields({
      name: Boolean(candidate.name),
      series: Boolean(nextSeries),
      block: Boolean(nextBlock),
      number: Boolean(nextNumber),
      language: Boolean(nextLanguage),
      rarity: Boolean(nextRarity),
      version: Boolean(nextVersion),
    });
  };

  const confirmNoCatalogMatch = () => {
    const fallbackCandidate = ocrCandidates[0] ?? null;
    const name = ocrParsed?.name || fallbackCandidate?.name || "";
    const seriesValue =
      ocrParsed?.set || String(fallbackCandidate?.setDetails?.name ?? "").trim() || fallbackCandidate?.set || "";
    const blockValue = fallbackCandidate ? resolveCandidateBlockValue(fallbackCandidate) : ocrParsed?.set || "";
    const numberValue = ocrParsed?.cardNumber || fallbackCandidate?.cardNumber || "";
    const languageValue =
      ocrParsed?.language || fallbackCandidate?.language || "";
    const rarityValue = ocrParsed?.rarity || fallbackCandidate?.rarity || "";
    const finishValue = ocrParsed?.finish || fallbackCandidate?.finish || "";
    const nextLanguageValue =
      languageValue && ["fr", "en", "jp"].includes(languageValue.toLowerCase())
        ? (languageValue.toLowerCase() as "fr" | "en" | "jp")
        : "";

    setMatchDecision("unmatched");
    setOcrSelectedCardRefId("");
    setTitleValue(name);
    setCardNameValue(name);
    setCardSeriesValue(seriesValue);
    setCardSetValue(blockValue);
    setCardNumberValue(numberValue);
    setCardLanguageValue(nextLanguageValue);
    setCardLanguageInputValue(nextLanguageValue.toUpperCase());
    setCardRarityValue(rarityValue);
    setCardFinishValue(finishValue);
    setAutoDetectedFields({
      name: Boolean(name),
      series: Boolean(seriesValue),
      block: Boolean(blockValue),
      number: Boolean(numberValue),
      language: Boolean(nextLanguageValue),
      rarity: Boolean(rarityValue),
      version: Boolean(finishValue),
    });
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
            previewPrice > 0 &&
            !cardNumberError &&
            !cardLanguageError
          : true;
  const isOcrNoMatchState = step === 2 && hasOcrResult && !isOcrLoading && ocrCandidates.length === 0;
  const isOcrActionStateReady = step === 2 && hasOcrResult && !isOcrLoading;

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
                          ? "border-primary bg-primary text-primary-foreground"
                          : "text-muted-foreground border-border"
                    }`}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : item.number}
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
            event.preventDefault();
            const submitFormData = new FormData(event.currentTarget);
            const frontEntry = submitFormData.get("front_image");
            const backEntry = submitFormData.get("back_image");
            if (
              (!(frontEntry instanceof File) || frontEntry.size === 0) &&
              frontFileRef.current
            ) {
              submitFormData.set("front_image", frontFileRef.current);
            }
            if (
              (!(backEntry instanceof File) || backEntry.size === 0) &&
              backFileRef.current
            ) {
              submitFormData.set("back_image", backFileRef.current);
            }
            setHasSubmittedCurrentFlow(true);
            startTransition(() => {
              formAction(submitFormData);
            });
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
          <input type="hidden" name="card_series" value={cardSeriesValue} />
          <input type="hidden" name="card_set" value={cardSetValue} />
          <input type="hidden" name="card_number" value={cardNumberValue} />
          <input type="hidden" name="card_language" value={cardLanguageValue} />
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
                  <div className="space-y-1">
                    <p className="text-destructive text-xs">{ocrError}</p>
                    <p className="text-xs text-muted-foreground">
                      Retente la capture avec plus de lumiere ou passe en saisie manuelle.
                    </p>
                  </div>
                ) : null}
                {!hasOcrResult ? (
                  <div className="h-[calc(100dvh-20rem)] min-h-[500px] flex items-center justify-center">
                    <div className="flex flex-col items-center gap-4">
                      <Image
                        src="/icons/app-icon-192.svg"
                        alt="Chargement"
                        width={64}
                        height={64}
                        className="h-16 w-16 animate-spin"
                      />
                      <p className="text-muted-foreground text-xs">Recherche de correspondance...</p>
                    </div>
                  </div>
                ) : isOcrLoading ? (
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
                ) : selectedOcrCandidate ? (
                  <div className="h-[calc(100dvh-20rem)] min-h-[500px] space-y-2">
                    <div className="space-y-3">
                      {selectedOcrCandidate.imageUrl ? (
                        <div className="bg-muted relative mx-auto aspect-[63/88] w-[min(45vw,180px)] overflow-hidden rounded-md border">
                          <Image
                            src={selectedOcrCandidate.imageUrl}
                            alt={selectedOcrCandidate.name}
                            fill
                            unoptimized
                            className="object-contain"
                          />
                        </div>
                      ) : null}
                      <div className="inline-flex max-w-full items-center gap-1.5">
                        <p className="text-base font-semibold line-clamp-2">
                          {selectedOcrCandidate.name}
                        </p>
                        <span className="bg-primary/10 text-primary shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium">
                          {Math.round(selectedOcrCandidate.score * 100)}%
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                        <div>
                          <p className="text-muted-foreground text-xs">Série</p>
                          <p className="text-sm line-clamp-1">
                            {selectedOcrCandidate.setDetails?.name ||
                              formatSetLabel(selectedOcrCandidate.set) ||
                              "-"}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Set number</p>
                          <p className="text-sm line-clamp-1">
                            {resolveDisplayedSetNumber({
                              candidateCardNumber: selectedOcrCandidate.cardNumber,
                              localId: selectedOcrCandidate.cardNumber,
                              official: selectedOcrCandidate.setDetails?.cardCount?.official,
                            })}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Bloc</p>
                          <p className="text-sm line-clamp-1">
                            {selectedOcrCandidate.setDetails?.serie?.name ||
                              selectedOcrCandidate.setDetails?.series ||
                              selectedOcrCandidate.setDetails?.id ||
                              selectedOcrCandidate.setDetails?.seriesId ||
                              "-"}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Langue</p>
                          <p className="text-sm line-clamp-1">
                            {selectedOcrCandidate.language
                              ? selectedOcrCandidate.language.toUpperCase()
                              : "-"}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Rarete</p>
                          <p className="text-sm line-clamp-1">
                            {selectedOcrCandidate.rarity || "-"}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Version</p>
                          <p className="text-sm line-clamp-1">
                            {selectedOcrCandidate.finish || "-"}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-muted-foreground text-xs">Illustrateur</p>
                          <p className="text-sm line-clamp-1">
                            {selectedOcrCandidate.illustrator || "-"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-[calc(100dvh-20rem)] min-h-[500px] flex items-center justify-center">
                    <div className="bg-card w-full max-w-md space-y-4 rounded-xl border p-5 text-center shadow-sm">
                      <div className="bg-background mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-border">
                        <Image
                          src="/icons/app-icon-192.svg"
                          alt="Aucune correspondance"
                          width={28}
                          height={28}
                          className="h-7 w-7"
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">Aucune correspondance fiable</p>
                        <p className="text-muted-foreground text-xs">
                          L&apos;OCR n&apos;a pas trouve de carte avec un niveau de confiance suffisant.
                        </p>
                      </div>
                      <div className="rounded-md bg-muted/50 px-3 py-2 text-left">
                        <p className="text-[11px] font-medium">Conseils rapides</p>
                        <p className="text-muted-foreground text-[11px]">
                          Lumiere uniforme, carte entiere dans le cadre, photo nette et sans reflets.
                        </p>
                      </div>
                    </div>
                  </div>
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
                    <Label htmlFor="card_name" className={`${FORM_LABEL_CLASS} flex items-center justify-between gap-2`}>
                      <span>Nom de la carte</span>
                      {renderAutoDetectedBadge(autoDetectedFields.name)}
                    </Label>
                    <Input
                      id="card_name"
                      placeholder="Ex: Dracaufeu"
                      value={cardNameValue}
                      onChange={(event) => {
                        setCardNameValue(event.target.value);
                        setAutoDetectedFields((previous) => ({ ...previous, name: false }));
                      }}
                      list="card-name-suggestions"
                      className={FORM_INPUT_CLASS}
                    />
                    <datalist id="card-name-suggestions">
                      {cardFieldSuggestions.names.map((value) => (
                        <option key={value} value={value} />
                      ))}
                    </datalist>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="card_series" className={`${FORM_LABEL_CLASS} flex items-center justify-between gap-2`}>
                      <span>Série</span>
                      {renderAutoDetectedBadge(autoDetectedFields.series)}
                    </Label>
                    <Input
                      id="card_series"
                      placeholder="Ex: Vainqueurs Supremes"
                      value={cardSeriesValue}
                      onChange={(event) => {
                        setCardSeriesValue(event.target.value);
                        setAutoDetectedFields((previous) => ({ ...previous, series: false }));
                      }}
                      list="card-series-suggestions"
                      className={FORM_INPUT_CLASS}
                    />
                    <datalist id="card-series-suggestions">
                      {cardFieldSuggestions.sets.map((value) => (
                        <option key={value} value={value} />
                      ))}
                    </datalist>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="card_set" className={`${FORM_LABEL_CLASS} flex items-center justify-between gap-2`}>
                      <span>Bloc</span>
                      {renderAutoDetectedBadge(autoDetectedFields.block)}
                    </Label>
                    <Input
                      id="card_set"
                      placeholder="Ex: Platine"
                      value={cardSetValue}
                      onChange={(event) => {
                        setCardSetValue(event.target.value);
                        setAutoDetectedFields((previous) => ({ ...previous, block: false }));
                      }}
                      className={FORM_INPUT_CLASS}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="card_finish" className={`${FORM_LABEL_CLASS} flex items-center justify-between gap-2`}>
                      <span>Version</span>
                      {renderAutoDetectedBadge(autoDetectedFields.version)}
                    </Label>
                    <Input
                      id="card_finish"
                      placeholder="Ex: Reverse Holo"
                      value={cardFinishValue}
                      onChange={(event) => {
                        setCardFinishValue(event.target.value);
                        setAutoDetectedFields((previous) => ({ ...previous, version: false }));
                      }}
                      list="card-version-suggestions"
                      className={FORM_INPUT_CLASS}
                    />
                    <datalist id="card-version-suggestions">
                      {cardFieldSuggestions.finishes.map((value) => (
                        <option key={value} value={value} />
                      ))}
                    </datalist>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="card_number" className={`${FORM_LABEL_CLASS} flex items-center justify-between gap-2`}>
                      <span>Numero</span>
                      {renderAutoDetectedBadge(autoDetectedFields.number)}
                    </Label>
                    <Input
                      id="card_number"
                      placeholder="Ex: 10/102"
                      value={cardNumberValue}
                      onChange={(event) => {
                        setCardNumberValue(event.target.value);
                        setAutoDetectedFields((previous) => ({ ...previous, number: false }));
                      }}
                      list="card-number-suggestions"
                      className={FORM_INPUT_CLASS}
                    />
                    {cardNumberError ? <p className="text-destructive text-xs">{cardNumberError}</p> : null}
                    <datalist id="card-number-suggestions">
                      {cardFieldSuggestions.numbers.map((value) => (
                        <option key={value} value={value} />
                      ))}
                    </datalist>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="card_language" className={`${FORM_LABEL_CLASS} flex items-center justify-between gap-2`}>
                      <span>Langue</span>
                      {renderAutoDetectedBadge(autoDetectedFields.language)}
                    </Label>
                    <Input
                      id="card_language"
                      placeholder="FR / EN / JP"
                      value={cardLanguageInputValue}
                      onChange={(event) => {
                        const nextInput = event.target.value.trim();
                        const next = nextInput.toLowerCase();
                        setCardLanguageInputValue(nextInput.toUpperCase());
                        setAutoDetectedFields((previous) => ({ ...previous, language: false }));
                        if (!nextInput) {
                          setCardLanguageValue("");
                          return;
                        }
                        if (next === "fr" || next === "en" || next === "jp") {
                          setCardLanguageValue(next);
                          return;
                        }
                        setCardLanguageValue("");
                      }}
                      list="card-language-suggestions"
                      className={FORM_INPUT_CLASS}
                    />
                    {cardLanguageError ? <p className="text-destructive text-xs">{cardLanguageError}</p> : null}
                    <datalist id="card-language-suggestions">
                      {cardFieldSuggestions.languages.map((value) => (
                        <option key={value} value={value} />
                      ))}
                    </datalist>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="card_rarity" className={`${FORM_LABEL_CLASS} flex items-center justify-between gap-2`}>
                      <span>Rarete</span>
                      {renderAutoDetectedBadge(autoDetectedFields.rarity)}
                    </Label>
                    <Input
                      id="card_rarity"
                      placeholder="Ex: Rare"
                      value={cardRarityValue}
                      onChange={(event) => {
                        setCardRarityValue(event.target.value);
                        setAutoDetectedFields((previous) => ({ ...previous, rarity: false }));
                      }}
                      list="card-rarity-suggestions"
                      className={FORM_INPUT_CLASS}
                    />
                    <datalist id="card-rarity-suggestions">
                      {cardFieldSuggestions.rarities.map((value) => (
                        <option key={value} value={value} />
                      ))}
                    </datalist>
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
                    Prix affiche sur l&apos;annonce (EUR)
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
                    Montant que le vendeur touchera: {previewSellerNet.toFixed(2)} EUR.
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
                  {step === 2 && !isOcrActionStateReady ? null : step === 2 && isOcrNoMatchState ? (
                    <div className="fixed inset-x-0 bottom-[max(0.75rem,var(--safe-area-bottom))] z-40 hidden justify-center px-4 md:flex">
                      <div className="grid w-full max-w-md grid-cols-1 gap-2">
                        <Button type="button" onClick={confirmNoCatalogMatch} className="h-12 text-base shadow-lg">
                          Passer en saisie manuelle
                        </Button>
                        <Button type="button" variant="outline" onClick={restartPhotoFlowForRetry} className="h-12">
                          Reprendre une photo
                        </Button>
                      </div>
                    </div>
                  ) : step === 2 && hasOcrResult && !isOcrLoading && !isOcrNoMatchState ? (
                    <div className="flex w-full flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={confirmNoCatalogMatch}>
                        Saisie manuelle
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
                  {step === 2 && !isOcrActionStateReady ? null : step === 2 && isOcrNoMatchState ? (
                    <div className="grid grid-cols-1 gap-2">
                      <Button type="button" onClick={confirmNoCatalogMatch} className="h-12 text-base shadow-lg">
                        Passer en saisie manuelle
                      </Button>
                      <Button type="button" variant="outline" onClick={restartPhotoFlowForRetry} className="h-12">
                        Reprendre une photo
                      </Button>
                    </div>
                  ) : step === 2 && hasOcrResult && !isOcrLoading && !isOcrNoMatchState ? (
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
                        Saisie manuelle
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
            {state.status === "error" ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {getActionableErrorHint(state.message)}
              </p>
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
                  <ol className="hide-scrollbar flex items-start justify-center gap-1 overflow-x-auto pb-1">
                    {cameraSteps.map((item, index) => {
                      const isActive =
                        (item.key === "front" && cameraSide === "front") ||
                        (item.key === "back" && cameraSide === "back");
                      const isDone =
                        (item.key === "front" && (frontSelected || cameraSide === "back")) ||
                        (item.key === "back" && backSelected);
                      return (
                        <li key={item.key} className="flex items-start">
                          <div className="flex min-w-14 flex-col items-center gap-1 text-[11px]">
                            <span
                              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                                isDone
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : isActive
                                    ? "border-white text-white"
                                    : "border-white/40 text-white/70"
                              }`}
                            >
                              {index + 1}
                            </span>
                            <span className={isActive ? "font-medium text-white" : "text-white/80"}>
                              {item.label}
                            </span>
                          </div>
                          {index < cameraSteps.length - 1 ? (
                            <span
                              className={`mt-3 mx-1 h-px w-5 ${
                                isDone ? "bg-primary/80" : "bg-white/30"
                              }`}
                              aria-hidden="true"
                            />
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
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
                      aria-label="Capturer la photo"
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
                        cardSeriesValue ||
                        cardSetValue ||
                        cardNumberValue ||
                        cardLanguageValue ||
                        cardRarityValue ||
                        cardFinishValue ||
                        selectedOcrCandidate ? (
                          <div className="space-y-2 border-t pt-3 text-sm">
                            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                              Identification carte
                            </p>
                            <div className="grid grid-cols-1 gap-1">
                              <p>
                                N°: {cardNumberValue || selectedOcrCandidate?.cardNumber || "-"}
                              </p>
                              <p>
                                Série:{" "}
                                {selectedOcrCandidate?.setDetails?.name ||
                                  cardSeriesValue ||
                                  formatSetLabel(selectedOcrCandidate?.set) ||
                                  "-"}
                              </p>
                              <p>
                                Bloc:{" "}
                                {selectedOcrCandidate?.setDetails?.serie?.name ||
                                  selectedOcrCandidate?.setDetails?.series ||
                                  selectedOcrCandidate?.setDetails?.id ||
                                  selectedOcrCandidate?.setDetails?.seriesId ||
                                  cardSetValue ||
                                  "-"}
                              </p>
                              <p>
                                Version: {cardFinishValue || selectedOcrCandidate?.finish || "-"}
                              </p>
                              <p>Rareté: {cardRarityValue || selectedOcrCandidate?.rarity || "-"}</p>
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
