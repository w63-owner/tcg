const MARKETPLACE_PERCENT_FEE = 0.05;
const MARKETPLACE_FIXED_FEE = 0.7;

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function calculateDisplayPrice(priceSeller: number) {
  return roundMoney(
    Number(priceSeller) * (1 + MARKETPLACE_PERCENT_FEE) + MARKETPLACE_FIXED_FEE,
  );
}

export function inferSellerNetFromDisplayed(displayAmount: number) {
  return Math.max(
    0,
    roundMoney(
      (Number(displayAmount) - MARKETPLACE_FIXED_FEE) / (1 + MARKETPLACE_PERCENT_FEE),
    ),
  );
}

export function calculateFeeAmount(displayAmount: number, sellerNetAmount: number) {
  return Math.max(0, roundMoney(Number(displayAmount) - Number(sellerNetAmount)));
}
