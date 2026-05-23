import { logger } from "@repo/logger";
import { env } from "../env";

interface NotifyFormResponseSubmittedParams {
  formTitle: string;
  formSlug: string;
  creatorEmail: string;
  respondentEmail?: string | null;
  responseId: string;
}

class EmailService {
  private readonly resendBaseUrl = "https://api.resend.com/emails";

  public async notifyFormResponseSubmitted(params: NotifyFormResponseSubmittedParams): Promise<void> {
    const creatorSubject = `New response for ${params.formTitle}`;
    const creatorHtml = [
      `<p>Your form <strong>${params.formTitle}</strong> received a new response.</p>`,
      `<p>Response ID: <code>${params.responseId}</code></p>`,
      `<p>Form link: ${this.buildFormUrl(params.formSlug)}</p>`,
    ].join("");

    await this.send({
      to: params.creatorEmail,
      subject: creatorSubject,
      html: creatorHtml,
    });

    if (params.respondentEmail) {
      const respondentSubject = `Thanks for submitting ${params.formTitle}`;
      const respondentHtml = [
        `<p>Thank you for submitting the form <strong>${params.formTitle}</strong>.</p>`,
        `<p>Your response reference: <code>${params.responseId}</code></p>`,
      ].join("");

      await this.send({
        to: params.respondentEmail,
        subject: respondentSubject,
        html: respondentHtml,
      });
    }
  }

  public async sendMessage(payload: { to: string; subject: string; html: string }) {
    await this.send(payload);
  }

  private async send(payload: { to: string; subject: string; html: string }) {
    const fromEmail = env.RESEND_FROM_EMAIL ?? "noreply@askly.dev";
    if (!env.RESEND_API_KEY) {
      logger.info(`Email send skipped (RESEND_API_KEY missing)`, {
        to: payload.to,
        subject: payload.subject,
      });
      return;
    }

    const response = await fetch(this.resendBaseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
      }),
    });

    if (!response.ok) {
      // Read body BEFORE throwing so we can include it in the error and
      // also log it (useful for the worker's `lastError` column).
      // Without throwing, the queue marks the job as "sent" even though
      // Resend rejected it — silent delivery failure. The job worker
      // catches this throw, increments attempts, and retries with backoff.
      const body = await response.text().catch(() => "<no body>");
      logger.error(`Email send failed`, {
        status: response.status,
        body,
        to: payload.to,
      });
      throw new Error(
        `Resend rejected message (status ${response.status}): ${body.slice(0, 200)}`,
      );
    }
  }

  private buildFormUrl(formSlug: string): string {
    const baseUrl = env.APP_BASE_URL ?? "http://localhost:3001";
    return `${baseUrl}/forms/${formSlug}`;
  }
}

export default EmailService;
