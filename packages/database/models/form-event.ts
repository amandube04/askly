import { pgEnum, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { formsTable } from "./form";

export const formEventTypeEnum = pgEnum("form_event_type", ["view", "start", "submit"]);

export const formEventsTable = pgTable("form_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  formId: uuid("form_id")
    .notNull()
    .references(() => formsTable.id, { onDelete: "cascade" }),
  eventType: formEventTypeEnum("event_type").notNull(),
  visitorId: varchar("visitor_id", { length: 120 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type SelectFormEvent = typeof formEventsTable.$inferSelect;
