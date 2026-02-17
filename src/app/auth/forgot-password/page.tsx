import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <section className="mx-auto flex min-h-[50vh] w-full max-w-md flex-col justify-center gap-4 px-4 py-8">
      <Card>
        <CardHeader className="space-y-1 text-center">
          <CardTitle>Mot de passe oublié</CardTitle>
          <p className="text-muted-foreground text-sm">
            Saisis ton email pour recevoir un lien de réinitialisation.
          </p>
        </CardHeader>
        <CardContent>
          <ForgotPasswordForm />
        </CardContent>
      </Card>
      <Button asChild variant="ghost" size="sm" className="w-full">
        <Link href="/auth">Retour à la connexion</Link>
      </Button>
    </section>
  );
}
