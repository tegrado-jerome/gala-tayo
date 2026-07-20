import { getSecret } from "../config/keyVault";
import { KEY_VAULT_SECRET_NAMES } from "../config/secretNames";

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";
const SENDER_EMAIL = "officialgalatayo@gmail.com";
const SENDER_NAME = "GalaTayo";

let apiKeyPromise: Promise<string | null> | null = null;

async function getBrevoApiKey(): Promise<string | null> {
  const envKey = process.env.BREVO_API_KEY?.trim();
  if (envKey) {
    return envKey;
  }

  if (!apiKeyPromise) {
    apiKeyPromise = getSecret(KEY_VAULT_SECRET_NAMES.BREVO_API_KEY)
      .then((key) => key.trim() || null)
      .catch(() => null);
  }
  return apiKeyPromise;
}

export async function sendOtpEmail(
  toEmail: string,
  otpCode: string,
): Promise<void> {
  const apiKey = await getBrevoApiKey();

  if (!apiKey) {
    throw new Error("Brevo API key is not configured.");
  }

  const response = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: SENDER_NAME,
        email: SENDER_EMAIL,
      },
      to: [{ email: toEmail }],
      subject: `Your GalaTayo verification code is ${otpCode}`,
      htmlContent: `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Your GalaTayo verification code</title>
  </head>
  <body style="margin:0; padding:0; background:#f8f7f4; font-family:'Nunito Sans', Arial, Helvetica, sans-serif; color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0; padding:0; background:#f8f7f4;">
      <tr>
        <td align="center" style="padding:56px 18px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px; margin:0 auto;">
            <tr>
              <td align="center" style="padding:46px 34px 42px; background:#ffffff; border:1px solid #e5e7eb; border-radius:28px;">

                 <div style="display:none;font-size:1px;color:#f8f7f4;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
                   Enter code ${otpCode} to confirm your login.
                 </div>

                 <img
                  src="https://pub-1cd8f9f5d9c94e76a4a823843bd23169.r2.dev/brand/galatayo-logo.png"
                  alt="GalaTayo"
                  width="220"
                  style="display:block; width:220px; max-width:82%; height:auto; margin:0 auto 36px; border:0;"
                />

                <div style="width:42px; height:2px; background:#1e3a8a; margin:0 auto 30px; border-radius:999px; line-height:2px; font-size:2px;">
                  &nbsp;
                </div>

                <p style="margin:0 0 10px; font-size:12px; line-height:1.4; letter-spacing:1.8px; text-transform:uppercase; color:#6b7280; font-weight:700;">
                  Login verification
                </p>

                <h1 style="margin:0 0 14px; font-size:28px; line-height:1.2; letter-spacing:-0.7px; color:#111827; font-weight:800;">
                  Your verification code
                </h1>

                <p style="margin:0 auto; max-width:400px; font-size:15.5px; line-height:1.75; color:#6b7280;">
                  Enter this code to confirm your login:
                </p>

                <div style="margin:30px auto; padding:20px 24px; background:#f8f7f4; border-radius:16px; border:1px solid #e5e7eb; max-width:280px;">
                  <span style="font-size:40px; font-weight:800; letter-spacing:10px; color:#111827; font-family:monospace;">${otpCode}</span>
                </div>

                <p style="margin:0 auto; max-width:390px; font-size:12.5px; line-height:1.65; color:#6b7280;">
                  This code expires in 5 minutes. If you did not request this code, you can safely ignore this email.
                </p>

              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 20px 0;">
                <p style="margin:0; font-size:11.5px; line-height:1.6; color:#9ca3af;">
                  GalaTayo &mdash; Find your next gala spot
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "Unknown error");
    throw new Error(`Brevo email send failed (${response.status}): ${errorBody}`);
  }
}
