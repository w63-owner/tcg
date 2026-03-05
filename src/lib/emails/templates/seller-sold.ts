export type SellerSoldParams = {
  cardName: string;
  totalAmountFormatted: string;
  shippingAddressFormatted: string;
  orderId: string;
};

const baseStyles = `
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1.6;
  color: #1a1a1a;
  max-width: 560px;
  margin: 0 auto;
`.trim();

export function buildSellerSoldHtml(params: SellerSoldParams): string {
  const { cardName, totalAmountFormatted, shippingAddressFormatted, orderId } = params;
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Vous avez vendu : ${escapeHtml(cardName)}</title>
</head>
<body style="${baseStyles}; padding: 24px;">
  <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 12px; padding: 24px; margin-bottom: 24px;">
    <h1 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 600;">🎉 Vous avez vendu une carte !</h1>
    <p style="margin: 0; color: #92400e;">${escapeHtml(cardName)}</p>
  </div>
  <p>Bonjour,</p>
  <p>Une vente vient d'être finalisée. <strong>Vous avez 3 jours ouvrés pour expédier cette carte</strong> à l'adresse de livraison suivante&nbsp;:</p>
  <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0; white-space: pre-line;">${escapeHtml(shippingAddressFormatted)}</div>
  <p><strong>Récapitulatif</strong></p>
  <ul style="list-style: none; padding: 0;">
    <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">Article : ${escapeHtml(cardName)}</li>
    <li style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">Montant : ${escapeHtml(totalAmountFormatted)}</li>
    <li style="padding: 8px 0;">Référence commande : ${escapeHtml(orderId)}</li>
  </ul>
  <p>Merci d'expédier dans les délais pour garder la confiance de l'acheteur.</p>
  <p style="color: #6b7280; font-size: 14px; margin-top: 32px;">— L'équipe TCG</p>
</body>
</html>
  `.trim();
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (c) => map[c] ?? c);
}
