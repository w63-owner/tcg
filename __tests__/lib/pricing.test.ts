import {
  calculateDisplayPrice,
  calculateFeeAmount,
  inferSellerNetFromDisplayed,
} from "@/lib/pricing";

describe("pricing", () => {
  it("calculates display price with marketplace fees", () => {
    expect(calculateDisplayPrice(100)).toBe(105.7);
    expect(calculateDisplayPrice(18)).toBe(19.6);
  });

  it("infers seller net from displayed amount", () => {
    expect(inferSellerNetFromDisplayed(105.7)).toBe(100);
    expect(inferSellerNetFromDisplayed(19.6)).toBe(18);
  });

  it("computes non-negative fee amount", () => {
    expect(calculateFeeAmount(105.7, 100)).toBe(5.7);
    expect(calculateFeeAmount(10, 15)).toBe(0);
  });
});
