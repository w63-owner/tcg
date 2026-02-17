import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

type SearchParams = {
  q?: string;
};

type PriceRow = {
  id: string;
  card_name: string;
  set_name: string;
  estimated_price: number;
  currency: string;
  last_updated_at: string;
};

type PriceCheckingPageProps = {
  searchParams: Promise<SearchParams>;
};

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
  }).format(value);
}

export default async function PriceCheckingPage({
  searchParams,
}: PriceCheckingPageProps) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();

  const supabase = await createClient();
  let request = supabase
    .from("price_estimations")
    .select("id, card_name, set_name, estimated_price, currency, last_updated_at")
    .order("estimated_price", { ascending: false })
    .limit(100);

  if (query) {
    request = request.ilike("card_name", `%${query}%`);
  }

  const { data } = await request;
  const rows = (data ?? []) as PriceRow[];

  return (
    <section className="space-y-4">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Price Checking</h1>
        <p className="text-muted-foreground text-sm">
          Reference de prix indicative basee sur `price_estimations`.
        </p>
      </header>

      <Card>
        <CardContent className="pt-6">
          <form className="flex gap-2">
            <Input
              name="q"
              defaultValue={query}
              placeholder="Rechercher une carte (ex: Charizard)"
              className="w-full"
            />
            <Button type="submit">
              Rechercher
            </Button>
          </form>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-md border p-6 text-center text-sm">
          Aucun prix disponible pour cette recherche.
        </p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Top resultats</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-md border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{row.card_name}</p>
                    <p className="text-muted-foreground text-xs">{row.set_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">
                      {formatMoney(Number(row.estimated_price), row.currency)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Maj: {new Date(row.last_updated_at).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
