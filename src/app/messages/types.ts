/** Structured metadata for system messages (offer_accepted, payment_completed, etc.) */
export type SystemMessageMetadata = {
  type:
    | "offer_accepted"
    | "offer_cancelled_by_buyer"
    | "payment_completed"
    | "order_shipped"
    | "sale_completed";
  offer_amount?: number;
  total_amount?: number;
  seller_credit?: number;
} | null;

/** Image message metadata (stored in metadata when message_type === 'image') */
export type ImageMessageMetadata = {
  image_url?: string;
  storage_path?: string;
  uploading?: boolean;
  preview_url?: string;
};
