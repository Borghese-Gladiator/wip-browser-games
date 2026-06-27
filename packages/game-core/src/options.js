// Pure validation for a room's per-room options bag (variants / stakes /
// ruleset). An adapter optionally declares an `optionsSchema`: a map of
// optionKey -> spec. We validate a client-supplied bag against it and return a
// normalized bag (defaults filled in, unknown keys dropped). No I/O.
//
// Spec shapes (kept deliberately small — one engine, a few knobs):
//   { type: 'enum',   values: [...], default }   // must be one of `values`
//   { type: 'int',    min, max, default }         // integer within [min, max]
//   { type: 'boolean', default }                  // true/false
//
// validateOptions throws on an invalid value so the gateway can reply with an
// error; it never partially applies.

function validateOne(key, spec, value) {
  if (value === undefined) {
    if ('default' in spec) return spec.default;
    throw new Error(`missing option: ${key}`);
  }
  switch (spec.type) {
    case 'enum':
      if (!spec.values.includes(value)) {
        throw new Error(`invalid option ${key}: ${value}`);
      }
      return value;
    case 'int':
      if (!Number.isInteger(value)) throw new Error(`option ${key} must be an integer`);
      if (spec.min !== undefined && value < spec.min) {
        throw new Error(`option ${key} below min ${spec.min}`);
      }
      if (spec.max !== undefined && value > spec.max) {
        throw new Error(`option ${key} above max ${spec.max}`);
      }
      return value;
    case 'boolean':
      if (typeof value !== 'boolean') throw new Error(`option ${key} must be a boolean`);
      return value;
    default:
      throw new Error(`unknown option spec type for ${key}: ${spec.type}`);
  }
}

// Validate `bag` against `schema`, returning a normalized bag containing exactly
// the schema's keys. An absent schema means the game takes no options → {}.
export function validateOptions(schema, bag = {}) {
  if (!schema) return {};
  const out = {};
  for (const [key, spec] of Object.entries(schema)) {
    out[key] = validateOne(key, spec, bag[key]);
  }
  return out;
}
