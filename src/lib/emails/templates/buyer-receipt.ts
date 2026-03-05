export type BuyerReceiptParams = {
  cardName: string;
  totalAmountFormatted: string;
  orderId: string;
};

const baseStyles = `
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1.6;
  color: #1a1a1a;
  max-width: 560px;
  margin: 0 auto;
`.trim();

export function buildBuyerReceiptHtml(params: BuyerReceiptParams): string {
  const { cardName, totalAmountFormatted, orderId } = params;
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirmation de votre commande</title>
</head>
<body style="${baseStyles}; padding: 24px;">
  <div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-radius: 12px; padding: 24px; margin-bottom: 24px;">
    <h1 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 600;">Confirmation de votre commande</h1>
    <p style="margin: 0; color: #166534;">Votre paiement a bien été enregistré.</p>
  </div>
  <p>Bonjour,</p>
  <p>Nous vous confirmons la réception de votre paiement pour la commande suivante&nbsp;:</p>
  <ul style="list-style: none; padding: 0;">
    <li style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
      <strong>Article</strong>&nbsp;: ${escapeHtml(cardName)}
    </li>
    <li style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
      <strong>Montant total</strong>&nbsp;: ${escapeHtml(totalAmountFormatted)}
    </li>
    <li style="padding: 12px 0;">
      <strong>Référence</strong>&nbsp;: ${escapeHtml(orderId)}
    </li>
  </ul>
  <p>Le vendeur a été notifié et doit expédier votre carte sous 3 jours ouvrés. Vous recevrez un email avec les détails d'expédition dès l'envoi.</p>
  <p>Merci pour votre confiance.</p>
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
