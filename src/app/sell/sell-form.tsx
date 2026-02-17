"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Camera } from "lucide-react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { createListingAction } from "./actions";
import { initialSellFormState } from "./sell-form-state";

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
const WEIGHT_CLASSES = ["XS", "S", "M", "L", "XL"] as const;

const SET_CODE_LABELS: Record<string, string> = {
  BASE1: "Set de Base",
  BASE2: "Jungle",
  BASE3: "Fossile",
  BASE4: "Base Set 2",
  BASE5: "Team Rocket",
  BASEP: "Promos Set de Base",
};

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

type OcrCandidate = {
  cardRefId: string;
  name: string;
  set: string;
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

const OCR_HIGH_CONFIDENCE_THRESHOLD = 0.75;
const OCR_MEDIUM_CONFIDENCE_THRESHOLD = 0.5;

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
  const [step, setStep] = useState(1);
  const [isGraded, setIsGraded] = useState(false);
  const [gradeValue, setGradeValue] = useState("10");
  const [titleValue, setTitleValue] = useState("");
  const [priceValue, setPriceValue] = useState("");
  const [conditionValue, setConditionValue] = useState("NEAR_MINT");
  const [gradingCompanyValue, setGradingCompanyValue] = useState("PSA");
  const [deliveryWeightClassValue, setDeliveryWeightClassValue] = useState("S");
  const [hasSubmittedCurrentFlow, setHasSubmittedCurrentFlow] = useState(false);
  const [frontSelected, setFrontSelected] = useState(false);
  const [backSelected, setBackSelected] = useState(false);
  const [cameraSide, setCameraSide] = useState<"front" | "back">("front");
  const [cameraError, setCameraError] = useState("");
  const [capturedPreviewUrl, setCapturedPreviewUrl] = useState<string | null>(null);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [ocrAttemptId, setOcrAttemptId] = useState("");
  const [ocrSelectedCardRefId, setOcrSelectedCardRefId] = useState("");
  const [ocrCandidates, setOcrCandidates] = useState<OcrCandidate[]>([]);
  const [ocrParsed, setOcrParsed] = useState<OcrParsed | null>(null);
  const [ocrConfidence, setOcrConfidence] = useState(0);
  const [ocrError, setOcrError] = useState("");
  const [ocrHint, setOcrHint] = useState("");
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
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
  const previewDisplayPrice =
    previewPrice > 0 ? Math.round((previewPrice * 1.05 + 0.7) * 100) / 100 : 0;
  const selectedOcrCandidate = useMemo(
    () => ocrCandidates.find((candidate) => candidate.cardRefId === ocrSelectedCardRefId) ?? null,
    [ocrCandidates, ocrSelectedCardRefId],
  );

  const checkpoints = [
    { label: "Photos", done: frontSelected && backSelected },
    { label: "Details", done: titleValue.trim().length >= 3 },
    { label: "Prix", done: Number.isFinite(previewPrice) && previewPrice > 0 },
    { label: "Pret", done: frontSelected && backSelected && titleValue.trim().length >= 3 && previewPrice > 0 },
  ];

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
    setOcrError("");
    setOcrHint("");

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
      const confidence = Number(json.confidence ?? 0);
      const attemptId = json.attemptId ?? "";
      setOcrCandidates(candidates);
      setOcrParsed(json.parsed ?? null);
      setOcrConfidence(confidence);
      setOcrAttemptId(attemptId);

      if (top) {
        setOcrSelectedCardRefId(top.cardRefId);
        void syncOcrSelection(attemptId, top.cardRefId);
      }

      if (confidence >= OCR_HIGH_CONFIDENCE_THRESHOLD) {
        setOcrHint("Confiance elevee: pre-remplissage automatique, corrige si besoin.");
      } else if (confidence >= OCR_MEDIUM_CONFIDENCE_THRESHOLD) {
        setOcrHint("Confiance moyenne: verifie les suggestions avant publication.");
      } else {
        setOcrHint("Confiance faible: complete manuellement, suggestions fournies.");
      }

      if (!titleValue.trim() && confidence >= OCR_HIGH_CONFIDENCE_THRESHOLD) {
        const detectedTitle = json.parsed?.name?.trim() || top?.name?.trim();
        if (detectedTitle) {
          setTitleValue(detectedTitle);
        }
      }

      if (!isGraded && json.parsed?.estimatedCondition) {
        setConditionValue(json.parsed.estimatedCondition);
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

  const canGoNext =
    step === 1
      ? frontSelected && backSelected
      : step === 2
        ? titleValue.trim().length >= 3
        : step === 3
          ? Number.isFinite(previewPrice) && previewPrice > 0
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
        <div className="flex flex-wrap gap-2">
          {checkpoints.map((checkpoint) => (
            <Badge key={checkpoint.label} variant={checkpoint.done ? "secondary" : "outline"}>
              {checkpoint.done ? "OK" : "..."} {checkpoint.label}
            </Badge>
          ))}
        </div>
      </header>
      <div>
        <form
          id="sell-form"
          action={formAction}
          className={`space-y-5 ${step === 1 ? "" : "pb-24 md:pb-0"}`}
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
          <input type="hidden" name="title" value={titleValue} />
          <input type="hidden" name="price_seller" value={priceValue} />
          <input type="hidden" name="condition" value={conditionValue} />
          <input type="hidden" name="grading_company" value={gradingCompanyValue} />
          <input type="hidden" name="grade_note" value={gradeValue} />
          <input type="hidden" name="delivery_weight_class" value={deliveryWeightClassValue} />
          <input type="hidden" name="card_ref_id" value={ocrSelectedCardRefId} />
          <input type="hidden" name="ocr_attempt_id" value={ocrAttemptId} />
          <div className="hidden">
            <input
              ref={frontInputRef}
              id="front_image"
              name="front_image"
              type="file"
              accept="image/*"
              capture="environment"
              required
              onChange={(event) => setFrontSelected(Boolean(event.target.files?.length))}
            />
            <input
              ref={backInputRef}
              id="back_image"
              name="back_image"
              type="file"
              accept="image/*"
              capture="environment"
              required
              onChange={(event) => setBackSelected(Boolean(event.target.files?.length))}
            />
          </div>

          {step === 2 ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="title">Titre de l&apos;annonce</Label>
                <Input
                  id="title"
                  placeholder="Ex: Dracaufeu EX 151 FR"
                  minLength={3}
                  maxLength={140}
                  required
                  value={titleValue}
                  onChange={(event) => setTitleValue(event.target.value)}
                />
              </div>

              <div className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">Detection OCR</p>
                  {isOcrLoading ? (
                    <span className="text-muted-foreground text-xs">Analyse...</span>
                  ) : (
                    <span className="text-muted-foreground text-xs">
                      Confiance: {Math.round(ocrConfidence * 100)}%
                    </span>
                  )}
                </div>
                {ocrError ? (
                  <p className="text-destructive text-xs">{ocrError}</p>
                ) : null}
                {ocrHint ? <p className="text-muted-foreground text-xs">{ocrHint}</p> : null}
                {ocrParsed ? (
                  <div className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {ocrParsed.language ? <span>Langue: {ocrParsed.language.toUpperCase()}</span> : null}
                    {ocrParsed.cardNumber ? <span>Numero: {ocrParsed.cardNumber}</span> : null}
                    {ocrParsed.set ? <span>Set: {formatSetLabel(ocrParsed.set)}</span> : null}
                    {ocrParsed.rarity ? <span>Rarete: {ocrParsed.rarity}</span> : null}
                    {ocrParsed.finish ? <span>Finition: {ocrParsed.finish}</span> : null}
                    {ocrParsed.estimatedCondition ? (
                      <span>Etat estime: {ocrParsed.estimatedCondition}</span>
                    ) : null}
                  </div>
                ) : null}
                {ocrCandidates.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {ocrCandidates.map((candidate) => (
                        <Button
                          key={candidate.cardRefId}
                          type="button"
                          variant={
                            ocrSelectedCardRefId === candidate.cardRefId
                              ? "default"
                              : "outline"
                          }
                          className="h-auto max-w-full px-2 py-1 text-left"
                          onClick={() => {
                            setOcrSelectedCardRefId(candidate.cardRefId);
                            setTitleValue(candidate.name);
                            if (ocrAttemptId) {
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
                          <span className="truncate text-xs">
                            {candidate.name} · {formatSetLabel(candidate.set)} ·{" "}
                            {Math.round(candidate.score * 100)}%
                          </span>
                        </Button>
                      ))}
                    </div>

                    {selectedOcrCandidate ? (
                      <div className="bg-muted/30 space-y-2 rounded-md border p-2 text-xs">
                        <p className="font-medium">Details de la proposition selectionnee</p>
                        <div className="text-muted-foreground grid grid-cols-2 gap-1">
                          <span>Nom: {selectedOcrCandidate.name}</span>
                          <span>Set: {formatSetLabel(selectedOcrCandidate.set)}</span>
                          <span>
                            Confiance: {Math.round(selectedOcrCandidate.score * 100)}%
                          </span>
                          <span>Numero: {selectedOcrCandidate.cardNumber || "-"}</span>
                          <span>
                            Langue:{" "}
                            {selectedOcrCandidate.language
                              ? selectedOcrCandidate.language.toUpperCase()
                              : "-"}
                          </span>
                          <span>HP: {selectedOcrCandidate.hp ?? "-"}</span>
                          <span>Rarete: {selectedOcrCandidate.rarity || "-"}</span>
                          <span>Finition: {selectedOcrCandidate.finish || "-"}</span>
                          <span>Secret: {selectedOcrCandidate.isSecret ? "Oui" : "Non"}</span>
                          <span>Promo: {selectedOcrCandidate.isPromo ? "Oui" : "Non"}</span>
                          <span>Vintage: {selectedOcrCandidate.vintageHint || "-"}</span>
                          <span>Regulation: {selectedOcrCandidate.regulationMark || "-"}</span>
                          <span>Illustrateur: {selectedOcrCandidate.illustrator || "-"}</span>
                          <span>
                            Etat estime: {selectedOcrCandidate.estimatedCondition || "-"}
                          </span>
                          <span>Annee: {selectedOcrCandidate.releaseYear ?? "-"}</span>
                          <span className="col-span-2">
                            Ref: {selectedOcrCandidate.tcgId || selectedOcrCandidate.cardRefId}
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-xs">
                    Aucune suggestion fiable. Tu peux saisir manuellement.
                  </p>
                )}
              </div>

              <div className="space-y-3 rounded-md border p-3">
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
                      <Label htmlFor="grading_company">Societe</Label>
                      <Select
                        value={gradingCompanyValue}
                        onValueChange={setGradingCompanyValue}
                        required={isGraded}
                      >
                        <SelectTrigger id="grading_company" className="w-full">
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
                      <Label htmlFor="grade_note">Note (1 a 10)</Label>
                      <Input
                        id="grade_note"
                        type="number"
                        min="1"
                        max="10"
                        step="0.5"
                        required={isGraded}
                        value={gradeValue}
                        onChange={(event) => setGradeValue(event.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Etat calcule automatiquement:{" "}
                        <span className="font-medium">{derivedCondition}</span>
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="condition">Etat</Label>
                    <Select
                      value={conditionValue}
                      onValueChange={setConditionValue}
                      required={!isGraded}
                    >
                      <SelectTrigger id="condition" className="w-full">
                        <SelectValue placeholder="Choisir un etat" />
                      </SelectTrigger>
                      <SelectContent>
                        {CONDITIONS.map((condition) => (
                          <SelectItem key={condition} value={condition}>
                            {condition}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </>
          ) : null}

          {step === 3 ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="price_seller">Prix net vendeur (EUR)</Label>
                <Input
                  id="price_seller"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="20.00"
                  required
                  value={priceValue}
                  onChange={(event) => setPriceValue(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Prix estime affiche: {previewDisplayPrice.toFixed(2)} EUR (hors livraison).
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="delivery_weight_class">Classe de poids</Label>
                <Select
                  value={deliveryWeightClassValue}
                  onValueChange={setDeliveryWeightClassValue}
                >
                  <SelectTrigger id="delivery_weight_class" className="w-full">
                    <SelectValue placeholder="Choisir une classe" />
                  </SelectTrigger>
                  <SelectContent>
                    {WEIGHT_CLASSES.map((weightClass) => (
                      <SelectItem key={weightClass} value={weightClass}>
                        {weightClass}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}

          <div className={`${step === 1 ? "hidden" : ""}`}>
            {step < 4 ? (
              <>
                <div className="hidden md:block">
                  <Button
                    type="button"
                    disabled={isPending || !canGoNext}
                    onClick={() => {
                      setHasSubmittedCurrentFlow(false);
                      setStep((current) => Math.min(4, current + 1));
                    }}
                    className="h-11 w-full text-base md:w-auto md:text-sm"
                  >
                    Etape suivante
                  </Button>
                </div>
                <div className="fixed inset-x-0 bottom-[max(0.75rem,var(--safe-area-bottom))] z-40 px-4 md:hidden">
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
                ? "border-green-500/40 bg-green-500/10"
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
      {step === 1 && typeof document !== "undefined"
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
                <div className="h-[70%] w-[64%] rounded-md border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
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
                <div className="rounded-md border border-white/30 bg-black/35 px-2 py-1 text-xs font-medium">
                  {cameraSide === "front" ? "RECTO" : "VERSO"}
                </div>
                <div className="h-9 w-9" />
              </div>

              <div className="pointer-events-none absolute top-16 right-4">
                <div className="relative h-20 w-14 rounded-sm border border-white/60 bg-white/20">
                  <div className="absolute inset-1 rounded-sm border border-white/70" />
                  <div className="absolute inset-x-0 bottom-1 text-center text-[9px] font-semibold">
                    {cameraSide === "front" ? "RECTO" : "VERSO"}
                  </div>
                </div>
              </div>

              <div className="absolute inset-x-0 bottom-0 space-y-2 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-4 pb-[max(1rem,var(--safe-area-bottom))] pt-10">
                {cameraError ? (
                  <p className="text-xs text-red-300">{cameraError}</p>
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
                      <Camera className="h-7 w-7" />
                    </Button>
                  </div>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
      {step === 4 && typeof document !== "undefined"
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

                <div className="space-y-3 rounded-md border p-4">
                  <p className="text-sm">
                    <span className="font-medium">Titre:</span> {titleValue || "A renseigner"}
                  </p>
                  <p className="text-sm">
                    <span className="font-medium">Prix vendeur:</span>{" "}
                    {previewPrice > 0 ? `${previewPrice.toFixed(2)} EUR` : "A renseigner"}
                  </p>
                  <p className="text-sm">
                    <span className="font-medium">Prix affiche estime:</span>{" "}
                    {previewDisplayPrice > 0 ? `${previewDisplayPrice.toFixed(2)} EUR` : "A renseigner"}
                  </p>
                  <p className="text-sm">
                    <span className="font-medium">Mode:</span>{" "}
                    {isGraded ? `Gradee (${derivedCondition})` : "Non gradee"}
                  </p>
                </div>

                <div className="mt-auto pt-4">
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
