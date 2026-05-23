import { db, eq, sql } from "@repo/database";
import { emailJobsTable } from "@repo/database/schema";
import { env as servicesEnv } from "@repo/services/env";
import { emailService } from "../services";

interface QueueFormResponseEmailParams {
  formTitle: string;
  formSlug: string;
  creatorEmail: string;
  respondentEmail?: string | null;
  responseId: string;
}

function buildCreatorEmailPayload(params: QueueFormResponseEmailParams) {
  // APP_BASE_URL is the deployed web origin; falls back to local dev so the
  // link is always present rather than hardcoded to localhost in prod.
  const appBaseUrl = servicesEnv.APP_BASE_URL ?? "http://localhost:3001";
  return {
    toEmail: params.creatorEmail,
    subject: `New response for ${params.formTitle}`,
    html: [
      `<p>Your form <strong>${params.formTitle}</strong> received a new response.</p>`,
      `<p>Response ID: <code>${params.responseId}</code></p>`,
      `<p>Form link: ${appBaseUrl}/forms/${params.formSlug}</p>`,
    ].join(""),
  };
}

function buildRespondentEmailPayload(params: QueueFormResponseEmailParams) {
  if (!params.respondentEmail) return null;
  return {
    toEmail: params.respondentEmail,
    subject: `Thanks for submitting ${params.formTitle}`,
    html: [
      `<p>Thank you for submitting the form <strong>${params.formTitle}</strong>.</p>`,
      `<p>Your response reference: <code>${params.responseId}</code></p>`,
    ].join(""),
  };
}

export async function enqueueFormResponseEmails(params: QueueFormResponseEmailParams) {
  const jobs = [buildCreatorEmailPayload(params), buildRespondentEmailPayload(params)].filter(
    (item): item is { toEmail: string; subject: string; html: string } => !!item,
  );

  if (jobs.length === 0) return;

  await db.insert(emailJobsTable).values(
    jobs.map((job) => ({
      toEmail: job.toEmail,
      subject: job.subject,
      html: job.html,
      payloadJson: {
        responseId: params.responseId,
      },
      status: "pending" as const,
      attempts: 0,
      maxAttempts: 5,
      nextAttemptAt: new Date(),
    })),
  );
}

function nextAttemptDate(attempts: number): Date {
  const delaySeconds = Math.min(300, Math.max(5, Math.pow(2, attempts) * 5));
  return new Date(Date.now() + delaySeconds * 1000);
}

async function claimPendingJobs(limit: number) {
  const claimedJobs = await db.execute(sql`
    update email_jobs as ej
    set status = 'processing', updated_at = now()
    from (
      select id
      from email_jobs
      where status = 'pending' and next_attempt_at <= now()
      order by next_attempt_at asc
      for update skip locked
      limit ${limit}
    ) as picked
    where ej.id = picked.id
    returning
      ej.id as "id",
      ej.to_email as "toEmail",
      ej.subject as "subject",
      ej.html as "html",
      ej.attempts as "attempts",
      ej.max_attempts as "maxAttempts",
      ej.next_attempt_at as "nextAttemptAt"
  `);
  return claimedJobs.rows as Array<{
    id: string;
    toEmail: string;
    subject: string;
    html: string;
    attempts: number;
    maxAttempts: number;
    nextAttemptAt: Date;
  }>;
}

export async function processPendingEmailJobs(limit = 20) {
  const jobs = await claimPendingJobs(limit);

  for (const job of jobs) {
    try {
      await emailService.sendMessage({
        to: job.toEmail,
        subject: job.subject,
        html: job.html,
      });

      await db
        .update(emailJobsTable)
        .set({
          status: "sent",
          sentAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(emailJobsTable.id, job.id));
    } catch (error) {
      const attempts = job.attempts + 1;
      const canRetry = attempts < job.maxAttempts;

      await db
        .update(emailJobsTable)
        .set({
          status: canRetry ? "pending" : "failed",
          attempts,
          nextAttemptAt: canRetry ? nextAttemptDate(attempts) : job.nextAttemptAt,
          lastError: error instanceof Error ? error.message : "Unknown email send error",
          updatedAt: new Date(),
        })
        .where(eq(emailJobsTable.id, job.id));

      console.error(`Email job failed`, {
        jobId: job.id,
        attempts,
        canRetry,
      });
    }
  }
}
