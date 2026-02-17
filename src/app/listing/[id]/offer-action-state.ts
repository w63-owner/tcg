export type OfferActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialOfferActionState: OfferActionState = {
  status: "idle",
  message: "",
};
