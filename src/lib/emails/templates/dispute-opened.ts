export type DisputeOpenedParams = {
  cardName: string;
  orderId: string;
  reasonLabel: string;
  description: string;
  isSeller: boolean;
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

export function buildDisputeOpenedHtml(params: DisputeOpenedParams): string {
  const { cardName, orderId, reasonLabel, description, isSeller } = params;
  const intro = isSeller
    ? "L'acheteur a ouvert un litige concernant la vente suivante."
    : "Vous avez ouvert un litige. Notre équipe va examiner votre demande.";
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Litige ouvert</title>
</head>
<body style="${baseStyles}; padding: 24px;">
  <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-radius: 12px; padding: 24px; margin-bottom: 24px;">
    <h1 style="margin: 0 0 8px 0; font-size: 20px; font-weight: 600;">⚠️ Litige ouvert</h1>
    <p style="margin: 0; color: #92400e;">${escapeHtml(cardName)} — Réf. ${escapeHtml(orderId)}</p>
  </div>
  <p>Bonjour,</p>
  <p>${intro}</p>
  <p><strong>Motif</strong>&nbsp;: ${escapeHtml(reasonLabel)}</p>
  <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0; white-space: pre-wrap;">${escapeHtml(description)}</div>
  <p>Les fonds restent bloqués jusqu'à résolution du litige par notre support.</p>
  <p style="color: #6b7280; font-size: 14px; margin-top: 32px;">— L'équipe TCG</p>
</body>
</html>
  `.trim();
}
