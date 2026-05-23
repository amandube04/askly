import { pgTable, uuid, timestamp, varchar, jsonb } from "drizzle-orm/pg-core";
import { formsTable } from "./form";

export const responsesTable = pgTable("responses", {
  id: uuid("id").primaryKey().defaultRandom(),
  formId: uuid("form_id")
    .notNull()
    .references(() => formsTable.id, { onDelete: "cascade" }),
  respondentEmail: varchar("respondent_email", { length: 255 }),
  metaJson: jsonb("meta_json").notNull().default({}),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
});

export type SelectResponse = typeof responsesTable.$inferSelect;
export type InsertResponse = typeof responsesTable.$inferInsert;
