/**
 * Ensures tool input schemas have a top-level "type" (e.g. "object") so providers
 * like Anthropic that require input_schema.type do not reject the request.
 * Zod 4 + AI SDK 6 can produce JSON Schema without "type" in some cases.
 */
import { jsonSchema } from "ai";
import { z } from "zod";

type JSONSchemaLike = Record<string, unknown>;

function ensureObjectType(schema: JSONSchemaLike): JSONSchemaLike {
  // Anthropic and some other providers prefer a clean JSON Schema without $schema header
  // and they REQUIRE a top-level "type" field (usually "object").
  const { $schema, ...rest } = schema;

  if (rest.type === "object" && rest.properties) {
    return rest;
  }

  return {
    type: "object",
    ...rest,
    properties: (rest.properties as Record<string, unknown>) ?? {},
  };
}

/**
 * Wraps a Zod schema for use as tool parameters so that the generated JSON Schema
 * always has a top-level "type" field (default "object"), satisfying Anthropic's
 * requirement: tools.N.custom.input_schema.type: Field required.
 */
export function toolInputSchema<T>(zodSchema: z.ZodType<T>) {
  const raw = z.toJSONSchema(zodSchema, {
    target: "draft-7",
    io: "input",
    reused: "inline",
  }) as JSONSchemaLike;
  const withType = ensureObjectType(raw);
  return jsonSchema(withType, {
    validate: async (value: unknown) => {
      const result = await z.safeParseAsync(zodSchema, value);
      return result.success
        ? { success: true as const, value: result.data }
        : { success: false as const, error: result.error };
    },
  });
}
