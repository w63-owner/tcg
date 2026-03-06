"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera } from "lucide-react";

type ProfileAvatarUploadProps = {
  avatarUrl: string | null;
  initial: string;
};

export function ProfileAvatarUpload({ avatarUrl, initial }: ProfileAvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [uploading, setUploading] = useState(false);

  const handleClick = () => {
    if (uploading) return;
    inputRef.current?.click();
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setUploading(true);
    try {
      const formData = new FormData();
      formData.set("avatar", file);

      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formData,
      });
      const result = (await res.json()) as
        | { success: true; avatarUrl: string }
        | { success: false; error: string };

      if (result.success) {
        toast.success("Photo de profil mise à jour.");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("Erreur lors de l'envoi.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={uploading}
      className="bg-muted relative h-16 w-16 shrink-0 overflow-hidden rounded-full border transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-70"
      aria-label="Changer la photo de profil"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={handleChange}
        aria-hidden
      />
      {avatarUrl ? (
        <Image src={avatarUrl} alt="Avatar profil" fill sizes="64px" className="object-cover" />
      ) : (
        <div className="text-muted-foreground flex h-full w-full items-center justify-center text-lg font-semibold">
          {initial}
        </div>
      )}
      <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 transition-opacity hover:opacity-100">
        <Camera className="h-6 w-6 text-white" aria-hidden />
      </span>
    </button>
  );
}
