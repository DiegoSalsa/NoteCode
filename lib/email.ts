type SendEmailInput = {
  to: string;
  subject: string;
  html?: string;
  text: string;
};

function getFromEmail() {
  return process.env.RESEND_FROM_EMAIL || "NoteCode <no-reply@notecode.cl>";
}

export async function sendEmail({ to, subject, html, text }: SendEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is required to send auth emails.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getFromEmail(),
      to,
      subject,
      html: html ?? textToHtml(text),
      text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Resend failed to send the email.${errorText ? ` ${errorText}` : ""}`);
  }

  return (await response.json().catch(() => null)) as { id?: string } | null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textToHtml(text: string) {
  return `<div style="font-family:Inter,Arial,sans-serif;line-height:1.55;color:#171717;white-space:pre-wrap">${escapeHtml(text)}</div>`;
}
