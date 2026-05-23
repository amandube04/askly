/* eslint-disable no-console */
/**
 * Seeds the database with judge-ready demo data:
 *   - 1 demo creator (demo@askly.dev)
 *   - 4 themes
 *   - 4 themed sample forms covering different verticals
 *   - 8-15 responses per form with realistic respondent emails
 *   - View / start / submit funnel events spread across the last 7 days
 *
 * Idempotent: re-running this script is safe.
 *   - Existing creator/themes/forms identified by unique keys are preserved.
 *   - Responses + events are only seeded for a given form when it currently
 *     has zero responses (so manually-submitted real data is never duplicated
 *     or nuked).
 */

import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { db } from "../index";
import {
  answersTable,
  formEventsTable,
  formFieldsTable,
  formsTable,
  responsesTable,
  themesTable,
  usersTable,
} from "../schema";

// ──────────────────────────────────────────────────────────────────────────
// Domain seed data
// ──────────────────────────────────────────────────────────────────────────

type FieldSeed = {
  type:
    | "short_text"
    | "long_text"
    | "email"
    | "number"
    | "single_select"
    | "multi_select"
    | "checkbox"
    | "rating"
    | "date";
  fieldKey: string;
  label: string;
  required: boolean;
  config?: {
    placeholder?: string;
    helpText?: string;
    options?: string[];
  };
};

type FormSeed = {
  slug: string;
  title: string;
  description: string;
  themeName: string;
  visibility: "public" | "unlisted";
  fields: FieldSeed[];
  /** Sample answer pools used to synthesize realistic responses. */
  sampleAnswers: Record<string, unknown[]>;
  /** Target number of responses + emails. */
  targetResponses: number;
  /** Funnel multipliers (events per response). */
  viewMultiplier: number;
  startMultiplier: number;
};

const THEMES: Array<{ name: string; description: string; configJson: Record<string, unknown> }> = [
  {
    name: "Spice Sand",
    description: "Dune-inspired desert + amber light theme.",
    configJson: { palette: "desert", font: "Manrope", accent: "#fcd34d" },
  },
  {
    name: "Cyberpunk Neon",
    description: "Neon gaming aesthetic with magenta + cyan glow.",
    configJson: { palette: "neon", font: "Space Grotesk", accent: "#f0abfc" },
  },
  {
    name: "Indie Builder",
    description: "Minimal startup workspace palette.",
    configJson: { palette: "graphite", font: "Inter", accent: "#a5b4fc" },
  },
  {
    name: "Manga Pop",
    description: "High-contrast comic book aesthetic for community forms.",
    configJson: { palette: "manga", font: "Inter", accent: "#fb7185" },
  },
];

const FORMS: FormSeed[] = [
  // ── 1) Existing gaming form, preserved
  {
    slug: "gaming-tournament-registration",
    title: "Cyberpunk Tournament Registration",
    description:
      "Register your squad for the weekend tournament. Brackets close 2 hours before kickoff.",
    themeName: "Cyberpunk Neon",
    visibility: "public",
    targetResponses: 14,
    viewMultiplier: 8,
    startMultiplier: 3,
    fields: [
      {
        type: "email",
        fieldKey: "player_email",
        label: "Player email",
        required: true,
        config: { placeholder: "you@example.com" },
      },
      {
        type: "single_select",
        fieldKey: "skill_tier",
        label: "Skill tier",
        required: true,
        config: { options: ["Bronze", "Silver", "Gold", "Platinum", "Diamond"] },
      },
      {
        type: "number",
        fieldKey: "years_played",
        label: "Years competing",
        required: false,
        config: { placeholder: "0" },
      },
      {
        type: "multi_select",
        fieldKey: "preferred_games",
        label: "Games you'll enter",
        required: true,
        config: {
          options: [
            "Valorant",
            "League of Legends",
            "CS2",
            "Rocket League",
            "Apex Legends",
          ],
        },
      },
      {
        type: "rating",
        fieldKey: "hype_level",
        label: "Hype level",
        required: false,
        config: { helpText: "How hyped are you, 1-5?" },
      },
    ],
    sampleAnswers: {
      skill_tier: ["Bronze", "Silver", "Gold", "Platinum", "Diamond"],
      years_played: [1, 2, 3, 4, 5, 6, 7, 10],
      preferred_games: [
        ["Valorant"],
        ["Valorant", "CS2"],
        ["League of Legends"],
        ["Apex Legends", "Valorant"],
        ["Rocket League"],
        ["CS2", "Apex Legends"],
      ],
      hype_level: [3, 4, 4, 5, 5, 5],
    },
  },

  // ── 2) Dune theme — matches the site
  {
    slug: "spice-logistics-recruitment",
    title: "Spice Logistics — Operative Recruitment",
    description:
      "Apply to House Atreides logistics. We move spice. We don't miss windows. Tell us who you are.",
    themeName: "Spice Sand",
    visibility: "public",
    targetResponses: 11,
    viewMultiplier: 10,
    startMultiplier: 4,
    fields: [
      {
        type: "short_text",
        fieldKey: "operative_callsign",
        label: "Operative callsign",
        required: true,
        config: { placeholder: "Muad'Dib, Stilgar, ..." },
      },
      {
        type: "email",
        fieldKey: "secure_channel",
        label: "Secure channel",
        required: true,
      },
      {
        type: "single_select",
        fieldKey: "preferred_house",
        label: "Preferred house",
        required: true,
        config: { options: ["Atreides", "Harkonnen", "Corrino", "Fremen", "Bene Gesserit"] },
      },
      {
        type: "multi_select",
        fieldKey: "skills",
        label: "Combat & navigation skills",
        required: true,
        config: {
          options: [
            "Sandwalker",
            "Crysknife combat",
            "Thopter pilot",
            "Spice harvester ops",
            "Worm rider",
            "Voice training",
          ],
        },
      },
      {
        type: "rating",
        fieldKey: "sandwalker_score",
        label: "Self-rated sandwalking",
        required: false,
      },
      {
        type: "long_text",
        fieldKey: "mission_pitch",
        label: "Why should we deploy you?",
        required: false,
        config: { placeholder: "60 seconds. Be specific." },
      },
    ],
    sampleAnswers: {
      operative_callsign: [
        "Muad'Dib",
        "Stilgar",
        "Chani",
        "Duncan",
        "Gurney",
        "Liet",
        "Jamis",
        "Sayyadina",
        "Reverend",
        "Naib",
        "Fedaykin",
      ],
      preferred_house: ["Atreides", "Atreides", "Fremen", "Fremen", "Bene Gesserit", "Harkonnen"],
      skills: [
        ["Sandwalker", "Crysknife combat"],
        ["Thopter pilot"],
        ["Worm rider", "Sandwalker"],
        ["Spice harvester ops"],
        ["Voice training", "Sandwalker"],
        ["Crysknife combat", "Worm rider", "Sandwalker"],
      ],
      sandwalker_score: [3, 4, 4, 5, 5, 5],
      mission_pitch: [
        "Trained on Caladan, blooded on Arrakis. Spice moves on my watch.",
        "I read the dunes the way you read your charts.",
        "Three harvests, zero losses to the worms. References on request.",
        "I've walked the deep desert without rhythm and made it home.",
      ],
    },
  },

  // ── 3) Indie hacker startup theme
  {
    slug: "indie-hacker-launch-pulse",
    title: "Indie Hacker Launch Pulse",
    description:
      "Quick pulse-check for indie builders about to launch. Anonymous. Helps the community see real numbers.",
    themeName: "Indie Builder",
    visibility: "public",
    targetResponses: 9,
    viewMultiplier: 6,
    startMultiplier: 2,
    fields: [
      {
        type: "short_text",
        fieldKey: "product_name",
        label: "Product name",
        required: true,
      },
      {
        type: "long_text",
        fieldKey: "one_liner",
        label: "One-liner",
        required: true,
        config: { placeholder: "We help X do Y so they can Z." },
      },
      {
        type: "email",
        fieldKey: "founder_email",
        label: "Founder email (optional)",
        required: false,
      },
      {
        type: "single_select",
        fieldKey: "stage",
        label: "Stage",
        required: true,
        config: { options: ["Idea", "Building", "Private beta", "Launched", "Profitable"] },
      },
      {
        type: "number",
        fieldKey: "monthly_revenue",
        label: "Monthly revenue (USD)",
        required: false,
        config: { placeholder: "0" },
      },
      {
        type: "multi_select",
        fieldKey: "channels",
        label: "Channels you ship through",
        required: true,
        config: { options: ["Twitter / X", "ProductHunt", "Reddit", "LinkedIn", "YouTube", "Email list"] },
      },
      {
        type: "rating",
        fieldKey: "founder_confidence",
        label: "Confidence in launch",
        required: false,
      },
    ],
    sampleAnswers: {
      product_name: [
        "Linklane",
        "Synapse Notes",
        "Tinybudget",
        "Greenhouse",
        "FormSled",
        "Daylog",
        "Pingcraft",
        "Outpost",
        "PenSparrow",
      ],
      one_liner: [
        "We help solo founders write launch copy in 10 minutes.",
        "A privacy-first replacement for your scattered Google docs.",
        "Headless email infra for indie products.",
        "Tiny budgeting app that doesn't try to be your bank.",
        "Open-source alternative to Calendly.",
      ],
      stage: ["Building", "Private beta", "Launched", "Launched", "Profitable", "Idea"],
      monthly_revenue: [0, 0, 150, 420, 1100, 2300, 5600],
      channels: [
        ["Twitter / X", "ProductHunt"],
        ["Twitter / X"],
        ["Reddit", "Email list"],
        ["LinkedIn", "Twitter / X"],
        ["YouTube"],
        ["Twitter / X", "Email list", "ProductHunt"],
      ],
      founder_confidence: [3, 3, 4, 4, 5],
    },
  },

  // ── 4) Anime convention RSVP — community theme
  {
    slug: "neo-tokyo-anime-rsvp",
    title: "Neo-Tokyo Anime Con — RSVP",
    description:
      "Lock in your slot for Neo-Tokyo 2026. Capacity is limited — we close RSVPs when the floor is full.",
    themeName: "Manga Pop",
    visibility: "public",
    targetResponses: 12,
    viewMultiplier: 7,
    startMultiplier: 3,
    fields: [
      {
        type: "short_text",
        fieldKey: "display_name",
        label: "Display name on badge",
        required: true,
      },
      {
        type: "email",
        fieldKey: "contact_email",
        label: "Contact email",
        required: true,
      },
      {
        type: "single_select",
        fieldKey: "cosplay_track",
        label: "Cosplay track",
        required: true,
        config: { options: ["No cosplay", "Casual", "Contest", "Masquerade headline"] },
      },
      {
        type: "multi_select",
        fieldKey: "panels",
        label: "Panels you'll attend",
        required: false,
        config: {
          options: [
            "Studio Ghibli retrospective",
            "Mecha design workshop",
            "Voice acting Q&A",
            "Webcomic monetization",
            "AI in animation",
          ],
        },
      },
      {
        type: "date",
        fieldKey: "arrival_date",
        label: "Arrival date",
        required: false,
      },
      {
        type: "rating",
        fieldKey: "excitement",
        label: "Excitement level",
        required: false,
      },
      {
        type: "checkbox",
        fieldKey: "consents_photo",
        label: "OK to be photographed at the event",
        required: false,
      },
    ],
    sampleAnswers: {
      display_name: [
        "Kiri",
        "Ren",
        "Mizuki",
        "Hayato",
        "Aoi",
        "Sora",
        "Yuki",
        "Kenji",
        "Rina",
        "Daichi",
        "Saki",
        "Touma",
      ],
      cosplay_track: ["No cosplay", "Casual", "Casual", "Contest", "Contest", "Masquerade headline"],
      panels: [
        ["Studio Ghibli retrospective"],
        ["Mecha design workshop", "AI in animation"],
        ["Voice acting Q&A"],
        ["Webcomic monetization", "AI in animation"],
        ["Studio Ghibli retrospective", "Voice acting Q&A"],
      ],
      arrival_date: ["2026-08-14", "2026-08-15", "2026-08-15", "2026-08-16"],
      excitement: [4, 4, 5, 5, 5],
      consents_photo: [true, true, false, true, true],
    },
  },
];

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

const RESPONDENT_EMAILS = [
  "alice.lin@example.com",
  "marcus.dev@example.com",
  "priya.s@example.com",
  "kenta.ono@example.com",
  "nora.b@example.com",
  "ethan.r@example.com",
  "haru.tanaka@example.com",
  "samira.h@example.com",
  "leo.m@example.com",
  "freya.k@example.com",
  "isaiah.j@example.com",
  "yuki.kim@example.com",
  "ananya.p@example.com",
  "tobias.w@example.com",
  "miriam.o@example.com",
];

function pick<T>(items: T[], index: number): T {
  return items[index % items.length] as T;
}

/**
 * Returns a Date randomly spread across the last `windowDays` days,
 * weighted to put more recent events in the last 48 hours.
 */
function randomRecentDate(windowDays: number, seed: number): Date {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  // Weighted: 60% in last 3 days, 40% in days 3..windowDays
  const recent = ((seed * 13) % 10) < 6;
  const dayOffset = recent
    ? ((seed * 7) % 3)
    : 3 + ((seed * 11) % Math.max(1, windowDays - 3));
  const intraDayMs = ((seed * 1_777) % dayMs);
  return new Date(now - dayOffset * dayMs - intraDayMs);
}

// ──────────────────────────────────────────────────────────────────────────
// Seeders
// ──────────────────────────────────────────────────────────────────────────

async function ensureDemoCreator(): Promise<string> {
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, "demo@askly.dev"))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(usersTable)
    .values({
      fullName: "Askly Demo Creator",
      email: "demo@askly.dev",
      role: "creator",
      passwordHash: "demo-password-hash",
      emailVerified: true,
    })
    .returning({ id: usersTable.id });
  if (!created) throw new Error("Failed to create demo creator");
  return created.id;
}

// Seed an admin-role user so the /admin dashboard has a way to be exercised
// in the demo. Uses a stable email so re-running seed is idempotent and
// the same Google OAuth account (when its email matches) is auto-promoted
// to admin. For local-only demos, the password-less placeholder hash is
// fine — the dashboard is reachable through the demo-session flow.
async function ensureAdmin(): Promise<string> {
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@askly.dev";
  const [existing] = await db
    .select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.email, adminEmail))
    .limit(1);
  if (existing) {
    // Promote to admin if the row exists but isn't marked admin yet (e.g.
    // user signed in with this Google account before we added the seed).
    if (existing.role !== "admin") {
      await db
        .update(usersTable)
        .set({ role: "admin" })
        .where(eq(usersTable.id, existing.id));
    }
    return existing.id;
  }

  const [created] = await db
    .insert(usersTable)
    .values({
      fullName: "Askly Admin",
      email: adminEmail,
      role: "admin",
      passwordHash: "demo-password-hash",
      emailVerified: true,
    })
    .returning({ id: usersTable.id });
  if (!created) throw new Error("Failed to create admin user");
  return created.id;
}

async function ensureThemes(): Promise<Map<string, string>> {
  const themeIds = new Map<string, string>();
  for (const theme of THEMES) {
    const [existing] = await db
      .select({ id: themesTable.id })
      .from(themesTable)
      .where(eq(themesTable.name, theme.name))
      .limit(1);
    if (existing) {
      themeIds.set(theme.name, existing.id);
      continue;
    }
    const [created] = await db
      .insert(themesTable)
      .values({
        name: theme.name,
        description: theme.description,
        configJson: theme.configJson,
        isSystem: true,
      })
      .returning({ id: themesTable.id });
    if (created) themeIds.set(theme.name, created.id);
  }
  return themeIds;
}

async function ensureForm(
  spec: FormSeed,
  creatorId: string,
  themeId: string | undefined,
): Promise<{ formId: string; fieldIdByKey: Map<string, string> }> {
  const [existing] = await db
    .select({ id: formsTable.id })
    .from(formsTable)
    .where(eq(formsTable.slug, spec.slug))
    .limit(1);

  let formId: string;
  if (existing) {
    formId = existing.id;
  } else {
    const [created] = await db
      .insert(formsTable)
      .values({
        creatorId,
        title: spec.title,
        description: spec.description,
        slug: spec.slug,
        visibility: spec.visibility,
        status: "published",
        themeId: themeId ?? null,
        isTemplate: true,
        publishedAt: new Date(),
      })
      .returning({ id: formsTable.id });
    if (!created) throw new Error(`Failed to create form ${spec.slug}`);
    formId = created.id;
  }

  // Ensure fields exist (idempotent by formId + fieldKey)
  const existingFields = await db
    .select({ id: formFieldsTable.id, fieldKey: formFieldsTable.fieldKey })
    .from(formFieldsTable)
    .where(eq(formFieldsTable.formId, formId));
  const existingKeys = new Set(existingFields.map((f) => f.fieldKey));

  const fieldsToInsert = spec.fields
    .filter((f) => !existingKeys.has(f.fieldKey))
    .map((f, idx) => ({
      formId,
      type: f.type,
      fieldKey: f.fieldKey,
      label: f.label,
      required: f.required,
      order: idx,
      configJson: f.config ?? {},
    }));

  if (fieldsToInsert.length > 0) {
    await db.insert(formFieldsTable).values(fieldsToInsert);
  }

  const allFields = await db
    .select({ id: formFieldsTable.id, fieldKey: formFieldsTable.fieldKey })
    .from(formFieldsTable)
    .where(eq(formFieldsTable.formId, formId));

  const fieldIdByKey = new Map(allFields.map((f) => [f.fieldKey, f.id] as const));
  return { formId, fieldIdByKey };
}

async function seedResponsesAndEvents(
  spec: FormSeed,
  formId: string,
  fieldIdByKey: Map<string, string>,
): Promise<{ insertedResponses: number; insertedEvents: number }> {
  // Skip if form already has any responses — preserves manually-submitted data.
  const [{ count: existingCount }] = (await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(responsesTable)
    .where(eq(responsesTable.formId, formId))) as Array<{ count: number }>;

  if (existingCount > 0) {
    return { insertedResponses: 0, insertedEvents: 0 };
  }

  const responsesToInsert = Array.from({ length: spec.targetResponses }, (_, i) => ({
    formId,
    respondentEmail: i % 4 === 3 ? null : pick(RESPONDENT_EMAILS, i),
    metaJson: { source: "seed-script" },
    submittedAt: randomRecentDate(7, i + 1),
  }));

  const insertedResponses = await db
    .insert(responsesTable)
    .values(responsesToInsert)
    .returning({ id: responsesTable.id });

  // Build answers for each response from the sampleAnswers pools.
  const answerRows: Array<{
    responseId: string;
    fieldId: string;
    valueJson: unknown;
  }> = [];
  for (let i = 0; i < insertedResponses.length; i++) {
    const response = insertedResponses[i];
    if (!response) continue;
    for (const field of spec.fields) {
      const pool = spec.sampleAnswers[field.fieldKey];
      let value: unknown;
      if (pool && pool.length > 0) {
        value = pick(pool, i);
      } else {
        switch (field.type) {
          case "email":
            value = pick(RESPONDENT_EMAILS, i);
            break;
          case "short_text":
            value = pick(["Anonymous", "Recruit", "Contact", "Player"], i);
            break;
          case "long_text":
            value = pick(
              ["Just here for the experience.", "Long-time fan, first-time submitting.", "Excited!"],
              i,
            );
            break;
          case "number":
            value = (i * 3) % 10;
            break;
          case "rating":
            value = 3 + (i % 3);
            break;
          case "date":
            value = new Date(Date.now() + i * 86_400_000).toISOString().slice(0, 10);
            break;
          case "checkbox":
            value = i % 2 === 0;
            break;
          default:
            value = "";
        }
      }
      const fieldId = fieldIdByKey.get(field.fieldKey);
      if (!fieldId) continue;
      answerRows.push({ responseId: response.id, fieldId, valueJson: value });
    }
  }
  if (answerRows.length > 0) {
    await db.insert(answersTable).values(answerRows);
  }

  // Funnel events: views (most), starts (fewer), submits (= response count).
  const viewCount = spec.targetResponses * spec.viewMultiplier;
  const startCount = spec.targetResponses * spec.startMultiplier;

  const eventRows: Array<{
    formId: string;
    eventType: "view" | "start" | "submit";
    visitorId: string;
    createdAt: Date;
  }> = [];

  for (let i = 0; i < viewCount; i++) {
    eventRows.push({
      formId,
      eventType: "view",
      visitorId: `seed-visitor-${randomUUID()}`,
      createdAt: randomRecentDate(7, i * 3 + 1),
    });
  }
  for (let i = 0; i < startCount; i++) {
    eventRows.push({
      formId,
      eventType: "start",
      visitorId: `seed-visitor-${randomUUID()}`,
      createdAt: randomRecentDate(7, i * 5 + 2),
    });
  }
  for (let i = 0; i < spec.targetResponses; i++) {
    const response = insertedResponses[i];
    eventRows.push({
      formId,
      eventType: "submit",
      visitorId: `seed-submit-${response?.id ?? i}`,
      createdAt: randomRecentDate(7, i * 7 + 3),
    });
  }

  await db.insert(formEventsTable).values(eventRows);
  return { insertedResponses: insertedResponses.length, insertedEvents: eventRows.length };
}

// ──────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────

async function seed() {
  console.log("→ ensuring demo creator");
  const creatorId = await ensureDemoCreator();

  console.log("→ ensuring admin user");
  await ensureAdmin();

  console.log("→ ensuring themes");
  const themeIds = await ensureThemes();

  for (const spec of FORMS) {
    const themeId = themeIds.get(spec.themeName);
    console.log(`→ ensuring form: ${spec.slug}`);
    const { formId, fieldIdByKey } = await ensureForm(spec, creatorId, themeId);

    const { insertedResponses, insertedEvents } = await seedResponsesAndEvents(
      spec,
      formId,
      fieldIdByKey,
    );

    if (insertedResponses === 0) {
      console.log(`   already has responses, skipping data seed`);
    } else {
      console.log(
        `   seeded ${insertedResponses} responses and ${insertedEvents} funnel events`,
      );
    }
  }
}

seed()
  .then(() => {
    console.log("Seed completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Seed failed", error);
    process.exit(1);
  });
