// src/lib/db/schema/emailEvents.ts
import { pgTable, bigserial, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
//                                                                ^^^^^^^^^

export const emailEvents = pgTable(
  "email_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    provider: text("provider").notNull().default("resend"),

    

    eventId: text("event_id"), // keep nullable if you want; unique index still works w/ NULLs
    eventType: text("event_type").notNull(),
    emailId: text("email_id"),
    messageId: text("message_id"),

    subject: text("subject"),
    fromAddress: text("from_address"),
    toCsv: text("to_csv"),

    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),

    emailCreatedAt: timestamp("email_created_at", { withTimezone: true, mode: "date" }),

    clickIp: text("click_ip"),
    clickLink: text("click_link"),
    clickTimestamp: timestamp("click_timestamp", { withTimezone: true, mode: "date" }),
    clickUserAgent: text("click_user_agent"),

    errorCode: text("error_code"),
    errorMessage: text("error_message"),

    idempotencyKey: text("idempotency_key"),
    raw: jsonb("raw"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (t) => ({
    byWhen: index("email_events_when_idx").on(t.occurredAt),
    byType: index("email_events_type_idx").on(t.eventType),
    byEmailId: index("email_events_email_id_idx").on(t.emailId),
    byMsgId: index("email_events_message_id_idx").on(t.messageId),
    byTo: index("email_events_to_idx").on(t.toCsv),
    bySubject: index("email_events_subject_idx").on(t.subject),

    // ✅ Unique index so ON CONFLICT(target: event_id) is valid
    byEventId: uniqueIndex("email_events_event_id_key").on(t.eventId),
  })
);


