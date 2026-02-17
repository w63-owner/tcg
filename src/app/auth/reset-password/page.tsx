import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ResetPasswordForm } from "./reset-password-form";

export default function ResetPasswordPage() {
  return (
    <section className="mx-auto flex min-h-[50vh] w-full max-w-md flex-col justify-center gap-4 px-4 py-8">
      <ResetPasswordForm />
      <Button asChild variant="ghost" size="sm" className="w-full">
        <Link href="/auth">Retour à la connexion</Link>
      </Button>
    </section>
  );
}
