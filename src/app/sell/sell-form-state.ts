export type SellFormState = {
  status: "idle" | "error" | "success";
  message: string;
  listingId?: string;
};

export const initialSellFormState: SellFormState = {
  status: "idle",
  message: "",
};
