"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { signInWithPassword, signUpWithPassword } from "./actions";

type AuthFormProps = {
  nextPath: string;
};

const AUTH_LABEL_CLASS = "text-muted-foreground text-xs";
const AUTH_INPUT_CLASS =
  "border-0 border-b border-border bg-transparent px-0 shadow-none rounded-none text-sm focus-visible:ring-0 focus-visible:border-b focus-visible:border-ring";

export function AuthForm({ nextPath }: AuthFormProps) {
  return (
    <div className="w-full max-w-md mx-auto space-y-4">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold">Pokemon Market</h1>
        <p className="text-muted-foreground text-sm">
          Connecte-toi ou crée un compte pour vendre et acheter des cartes.
        </p>
      </div>
      <Tabs defaultValue="signin" className="w-full">
        <TabsList variant="line" className="grid w-full grid-cols-2">
          <TabsTrigger value="signin">Connexion</TabsTrigger>
          <TabsTrigger value="signup">Inscription</TabsTrigger>
        </TabsList>

        <TabsContent value="signin" className="space-y-4 pt-4">
          <form action={signInWithPassword} className="space-y-3">
            <input type="hidden" name="next" value={nextPath} />
            <div className="space-y-2">
              <Label htmlFor="sign-in-email" className={AUTH_LABEL_CLASS}>
                Email
              </Label>
              <Input
                id="sign-in-email"
                name="email"
                type="email"
                placeholder="toi@exemple.fr"
                required
                autoComplete="email"
                className={AUTH_INPUT_CLASS}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sign-in-password" className={AUTH_LABEL_CLASS}>
                Mot de passe
              </Label>
              <Input
                id="sign-in-password"
                name="password"
                type="password"
                minLength={6}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className={AUTH_INPUT_CLASS}
              />
            </div>
            <Button type="submit" className="w-full">
              Se connecter
            </Button>
            <Link
              href="/auth/forgot-password"
              className="text-muted-foreground block text-center text-xs hover:underline"
            >
              Mot de passe oublié ?
            </Link>
          </form>
        </TabsContent>

        <TabsContent value="signup" className="space-y-4 pt-4">
          <form action={signUpWithPassword} className="space-y-3">
            <input type="hidden" name="next" value={nextPath} />
            <div className="space-y-2">
              <Label htmlFor="sign-up-username" className={AUTH_LABEL_CLASS}>
                Pseudo (3-30 caractères)
              </Label>
              <Input
                id="sign-up-username"
                name="username"
                type="text"
                minLength={3}
                maxLength={30}
                placeholder="DresseurPokemon"
                autoComplete="username"
                pattern="[a-zA-Z0-9_-]+"
                title="Lettres, chiffres, tirets et underscores uniquement"
                className={AUTH_INPUT_CLASS}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sign-up-email" className={AUTH_LABEL_CLASS}>
                Email
              </Label>
              <Input
                id="sign-up-email"
                name="email"
                type="email"
                required
                placeholder="toi@exemple.fr"
                autoComplete="email"
                className={AUTH_INPUT_CLASS}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sign-up-password" className={AUTH_LABEL_CLASS}>
                Mot de passe (min. 6 caractères)
              </Label>
              <Input
                id="sign-up-password"
                name="password"
                type="password"
                minLength={6}
                required
                autoComplete="new-password"
                placeholder="••••••••"
                className={AUTH_INPUT_CLASS}
              />
            </div>
            <Button type="submit" variant="outline" className="w-full">
              Créer mon compte
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}
