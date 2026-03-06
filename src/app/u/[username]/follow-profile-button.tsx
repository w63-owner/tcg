"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addFavoriteSeller, removeFavoriteSeller } from "@/app/favorites/actions";

type FollowProfileButtonProps = {
  sellerId: string;
  username: string;
  isFollowing: boolean;
  returnPath: string;
};

export function FollowProfileButton({
  sellerId,
  username,
  isFollowing,
  returnPath,
}: FollowProfileButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleFollow = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("seller_id", sellerId);
      formData.set("return_path", returnPath);
      if (isFollowing) {
        await removeFavoriteSeller(formData);
      } else {
        await addFavoriteSeller(formData);
      }
      router.refresh();
    });
  };

  return (
    <div className="fixed inset-x-0 bottom-20 z-30 px-4 md:bottom-6 md:left-auto md:right-6 md:max-w-sm">
      <Button
        onClick={handleFollow}
        disabled={pending}
        className="w-full shadow-lg md:w-auto md:min-w-[140px]"
        variant={isFollowing ? "secondary" : "default"}
      >
        {isFollowing ? (
          <>
            <UserCheck className="mr-2 size-4" />
            Suivi
          </>
        ) : (
          <>
            <UserPlus className="mr-2 size-4" />
            Suivre {username}
          </>
        )}
      </Button>
    </div>
  );
}
