import { pgTable, uuid, jsonb, timestamp } from "drizzle-orm/pg-core";
import { responsesTable } from "./response";
import { formFieldsTable } from "./form-field";

export const answersTable = pgTable("answers", {
  id: uuid("id").primaryKey().defaultRandom(),
  responseId: uuid("response_id")
    .notNull()
    .references(() => responsesTable.id, { onDelete: "cascade" }),
  fieldId: uuid("field_id")
    .notNull()
    .references(() => formFieldsTable.id, { onDelete: "cascade" }),
  valueJson: jsonb("value_json").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type SelectAnswer = typeof answersTable.$inferSelect;
export type InsertAnswer = typeof answersTable.$inferInsert;
