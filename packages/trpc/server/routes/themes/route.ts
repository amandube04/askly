import { asc, db } from "@repo/database";
import { themesTable } from "@repo/database/schema";
import { z } from "@repo/validators";
import { publicProcedure, router } from "../../trpc";
import { generatePath } from "../../utils/path-generator";

const TAGS = ["Themes"];
const getPath = generatePath("/themes");

/**
 * Themes are read-only catalog data — creators pick one from a fixed gallery
 * when editing a form (see `formsTable.themeId`). Listing is publicly readable
 * so the public form renderer can also fetch the theme if it needs to (today
 * it gets the theme inlined via `forms.getBySlug`, but a standalone endpoint
 * keeps the Scalar API docs useful and lets the dashboard editor populate
 * a theme picker without leaking creator data).
 */
export const themesRouter = router({
  list: publicProcedure
    .meta({ openapi: { method: "GET", path: getPath("/"), tags: TAGS } })
    .input(z.undefined())
    .output(
      z.array(
        z.object({
          id: z.string().uuid(),
          name: z.string(),
          description: z.string().nullable(),
          // configJson is the shape `{ palette, font, accent }` today but
          // emitted as `unknown` so we can grow the theme schema without
          // a breaking API change.
          configJson: z.unknown(),
        }),
      ),
    )
    .query(async () => {
      return db
        .select({
          id: themesTable.id,
          name: themesTable.name,
          description: themesTable.description,
          configJson: themesTable.configJson,
        })
        .from(themesTable)
        .orderBy(asc(themesTable.name));
    }),
});
