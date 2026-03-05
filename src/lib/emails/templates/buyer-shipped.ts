export type BuyerShippedParams = {
  cardName: string;
  trackingNumber?: string;
  trackingUrl?: string;
};

const baseStyles = `
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1.6;
  color: #1a1a1a;
  max-width: 560px;
  margin: 0 auto;
`.trim();

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

export function buildBuyerShippedHtml(params: BuyerShippedParams): string {
  const { cardName, trackingNumber, trackingUrl } = params;
  const hasTracking = Boolean(trackingNumber || trackingUrl);

  const trackingBlock = hasTracking
    ? `
  <p><strong>Suivi d&apos;expédition</strong></p>
  <ul style="list-style: none; padding: 0;">
    ${trackingNumber ? `<li style="padding: 8px 0;">Numéro de suivi : ${escapeHtml(trackingNumber)}</li>` : ""}
    ${trackingUrl ? `<li style="padding: 8px 0;"><a href="${escapeHtml(trackingUrl)}" style="color: #2563eb;">Suivre mon colis</a></li>` : ""}
  </ul>
  `
    : "";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Votre carte est en route</title>
</head>
<body style="${baseStyles}; padding: 24px;">
  <div style="background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); border-radius: 12px; padding: 24px; margin-bottom: 24px;">
    <h1 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 600;">🎉 Votre carte est en route !</h1>
    <p style="margin: 0; color: #1e40af;">Le vendeur a expédié votre commande.</p>
  </div>
  <p>Bonjour,</p>
  <p>Bonne nouvelle : le vendeur a expédié votre commande pour <strong>${escapeHtml(cardName)}</strong>.</p>
  ${trackingBlock}
  <p>Vous recevrez votre colis sous peu.</p>
  <p>Merci pour votre confiance.</p>
  <p style="color: #6b7280; font-size: 14px; margin-top: 32px;">— L'équipe TCG</p>
</body>
</html>
  `.trim();
}
