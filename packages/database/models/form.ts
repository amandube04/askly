import {
  pgEnum,
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { themesTable } from "./theme";
import { usersTable } from "./user";

export const formVisibilityEnum = pgEnum("form_visibility", ["public", "unlisted"]);
export const formStatusEnum = pgEnum("form_status", ["draft", "published", "unpublished", "archived"]);

export const formsTable = pgTable("forms", {
  id: uuid("id").primaryKey().defaultRandom(),
  creatorId: uuid("creator_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 120 }).notNull(),
  description: text("description"),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  visibility: formVisibilityEnum("visibility").notNull().default("unlisted"),
  status: formStatusEnum("status").notNull().default("draft"),
  themeId: uuid("theme_id").references(() => themesTable.id, { onDelete: "set null" }),
  isTemplate: boolean("is_template").notNull().default(false),
  responseLimit: integer("response_limit"),
  expiresAt: timestamp("expires_at"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SelectForm = typeof formsTable.$inferSelect;
export type InsertForm = typeof formsTable.$inferInsert;
