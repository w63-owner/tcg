export type ForgotPasswordState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialForgotPasswordState: ForgotPasswordState = {
  status: "idle",
  message: "",
};

export type ResetPasswordState = {
  status: "idle" | "success" | "error";
  message: string;
};

export const initialResetPasswordState: ResetPasswordState = {
  status: "idle",
  message: "",
};
