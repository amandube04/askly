import { pgTable, uuid, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./user";

export const authSessionsTable = pgTable("auth_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  accessTokenHash: varchar("access_token_hash", { length: 128 }).notNull().unique(),
  refreshTokenHash: varchar("refresh_token_hash", { length: 128 }).notNull().unique(),
  previousRefreshTokenHash: varchar("previous_refresh_token_hash", { length: 128 }),
  csrfTokenHash: varchar("csrf_token_hash", { length: 128 }).notNull(),
  ipAddress: varchar("ip_address", { length: 120 }),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at").notNull(),
  refreshExpiresAt: timestamp("refresh_expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SelectAuthSession = typeof authSessionsTable.$inferSelect;
