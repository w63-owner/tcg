import Link from "next/link";
import { AuthForm } from "./auth-form";

type AuthPageProps = {
  searchParams: Promise<{
    next?: string;
    error?: string;
    confirmed?: string;
  }>;
};

export default async function AuthPage({ searchParams }: AuthPageProps) {
  const params = await searchParams;
  const nextPath = params.next ?? "";
  const error = params.error ?? "";
  const confirmed = params.confirmed === "1";

  return (
    <section className="mx-auto flex min-h-[60vh] w-full max-w-5xl flex-col items-center justify-center gap-6 px-4 py-8">
      <AuthForm nextPath={nextPath} />

      {error ? (
        <div className="border-destructive/40 bg-destructive/10 text-destructive w-full max-w-md rounded-md border p-3 text-center text-sm">
          {decodeURIComponent(error)}
        </div>
      ) : null}

      {confirmed ? (
        <div className="border-primary/40 bg-primary/10 text-primary w-full max-w-md rounded-md border p-3 text-center text-sm">
          Compte créé. Vérifie ton email pour confirmer ton adresse (si activé par l’admin).
        </div>
      ) : null}

      <p className="text-muted-foreground text-center text-sm">
        En créant un compte, tu acceptes les conditions d’utilisation de la marketplace.
      </p>
    </section>
  );
}
