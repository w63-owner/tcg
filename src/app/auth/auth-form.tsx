"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { signInWithPassword, signUpWithPassword } from "./actions";

type AuthFormProps = {
  nextPath: string;
};

export function AuthForm({ nextPath }: AuthFormProps) {
  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl">Pokemon Market</CardTitle>
        <p className="text-muted-foreground text-sm">
          Connecte-toi ou crée un compte pour vendre et acheter des cartes.
        </p>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="signin" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Connexion</TabsTrigger>
            <TabsTrigger value="signup">Inscription</TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="space-y-4 pt-4">
            <form action={signInWithPassword} className="space-y-3">
              <input type="hidden" name="next" value={nextPath} />
              <div className="space-y-2">
                <Label htmlFor="sign-in-email">Email</Label>
                <Input
                  id="sign-in-email"
                  name="email"
                  type="email"
                  placeholder="toi@exemple.fr"
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="sign-in-password">Mot de passe</Label>
                  <Link
                    href="/auth/forgot-password"
                    className="text-muted-foreground text-xs hover:underline"
                  >
                    Mot de passe oublié ?
                  </Link>
                </div>
                <Input
                  id="sign-in-password"
                  name="password"
                  type="password"
                  minLength={6}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
              </div>
              <Button type="submit" className="w-full">
                Se connecter
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup" className="space-y-4 pt-4">
            <form action={signUpWithPassword} className="space-y-3">
              <input type="hidden" name="next" value={nextPath} />
              <div className="space-y-2">
                <Label htmlFor="sign-up-username">Pseudo (3-30 caractères)</Label>
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
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sign-up-email">Email</Label>
                <Input
                  id="sign-up-email"
                  name="email"
                  type="email"
                  required
                  placeholder="toi@exemple.fr"
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sign-up-password">Mot de passe (min. 6 caractères)</Label>
                <Input
                  id="sign-up-password"
                  name="password"
                  type="password"
                  minLength={6}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
              </div>
              <Button type="submit" variant="outline" className="w-full">
                Créer mon compte
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
