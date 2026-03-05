import { Button } from "@/components/ui/button";
import { startOfferCheckoutAction } from "@/app/offers/actions";

type BuyReservedFormProps = {
  offerId: string;
};

export async function BuyReservedForm({ offerId }: BuyReservedFormProps) {
  return (
    <form action={startOfferCheckoutAction}>
      <input type="hidden" name="offer_id" value={offerId} />
      <Button type="submit" className="w-full">
        Acheter
      </Button>
    </form>
  );
}
