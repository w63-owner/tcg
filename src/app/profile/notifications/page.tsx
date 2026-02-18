import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationSettingsClient } from "./notification-settings-client";

export default function ProfileNotificationsPage() {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" className="-ml-2 h-9 w-9">
          <Link href="/profile" aria-label="Retour">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Notifications</h1>
      </div>
      <NotificationSettingsClient />
    </section>
  );
}
