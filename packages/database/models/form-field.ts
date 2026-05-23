import { pgTable, uuid, varchar, boolean, integer, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { formsTable } from "./form";

export const formFieldTypeEnum = pgEnum("form_field_type", [
  "short_text",
  "long_text",
  "email",
  "number",
  "single_select",
  "multi_select",
  "checkbox",
  "rating",
  "date",
]);

export const formFieldsTable = pgTable("form_fields", {
  id: uuid("id").primaryKey().defaultRandom(),
  formId: uuid("form_id")
    .notNull()
    .references(() => formsTable.id, { onDelete: "cascade" }),
  type: formFieldTypeEnum("type").notNull(),
  fieldKey: varchar("field_key", { length: 64 }).notNull(),
  label: varchar("label", { length: 120 }).notNull(),
  required: boolean("required").notNull().default(false),
  order: integer("order").notNull().default(0),
  configJson: jsonb("config_json").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SelectFormField = typeof formFieldsTable.$inferSelect;
export type InsertFormField = typeof formFieldsTable.$inferInsert;
