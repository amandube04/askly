import { pgEnum, pgTable, text, timestamp, uuid, varchar, integer, jsonb } from "drizzle-orm/pg-core";

export const emailJobStatusEnum = pgEnum("email_job_status", ["pending", "processing", "failed", "sent"]);

export const emailJobsTable = pgTable("email_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  toEmail: varchar("to_email", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  html: text("html").notNull(),
  payloadJson: jsonb("payload_json").notNull().default({}),
  status: emailJobStatusEnum("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(5),
  nextAttemptAt: timestamp("next_attempt_at").notNull().defaultNow(),
  lastError: text("last_error"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SelectEmailJob = typeof emailJobsTable.$inferSelect;
