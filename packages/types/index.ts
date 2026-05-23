export const formVisibilityValues = ["public", "unlisted"] as const;
export type FormVisibility = (typeof formVisibilityValues)[number];

export const formStatusValues = ["draft", "published", "unpublished", "archived"] as const;
export type FormStatus = (typeof formStatusValues)[number];

export const fieldTypeValues = [
  "short_text",
  "long_text",
  "email",
  "number",
  "single_select",
  "multi_select",
  "checkbox",
  "rating",
  "date",
] as const;
export type FieldType = (typeof fieldTypeValues)[number];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
