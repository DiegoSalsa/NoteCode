type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

function getFromEmail() {
  return process.env.RESEND_FROM_EMAIL || "PuroCode <no-reply@purocode.cl>";
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
      html,
      text,
    }),
  });

  if (!response.ok) {
    throw new Error("Resend failed to send the email.");
  }
}
