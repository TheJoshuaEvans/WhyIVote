/**
 * Base class used for all escape clients
 */
class EscapeBase {
  /**
   * The value that needs to be escaped somehow
   */
  value;

  constructor(value) {
    this.value = value;
  }
}

/**
 * Represents a dictionary of parameters in PostgreSQL meant to be used in a WHERE clause. Will
 * be parsed into separate parameterized values joined by an AND statement in the form
 * `AND key1=$1 AND key2=$2`
 */
class EscapeAndDictionary extends EscapeBase {}

/**
 * Represents an array of parameters, to be rendered as a parameterized [literal array](https://www.postgresql.org/docs/current/arrays.html#ARRAYS-INPUT)
 * in the final SQL. Example: `ARRAY[$1, $2, $3]`
 */
class EscapeArrayParameters extends EscapeBase {}

/**
 * Represents a dictionary of parameters in PostgreSQL. Will be parsed into separate
 * parameterized values for each key-value pair in the dictionary object in the form
 * `key1=$1, key2=$2`
 */
class EscapeDictionary extends EscapeBase {}

/**
 * Represents an "Identifier" in PostgreSQL. Will be parsed using the [pg.escapeIdentifier](https://node-postgres.com/apis/utilities#pgescapeidentifier)
 * method, which mostly means the value will be surrounded in double quotes in the final query
 */
class EscapeIdentifier extends EscapeBase {}

/**
 * Represents a "Parameter" in PostgreSQL. Will be parsed into a parameter index (`$1`, `$2`,
 * etc) and an accompanying value in the `values` array
 */
class EscapeParameter extends EscapeBase {}

/**
 * Represents a dictionary of parameters in PostgreSQL intended for use on INSERT queries. Will
 * be parsed into separate parameterized values for each key-value pair in the dictionary object,
 * in `(key1,key2) VALUES ($1,$2)` form. If an array of dictionary objects are provided, the
 * result will be in the form `(key1,key2) VALUES ($1,$2),($3,$4)`, using the first object in
 * the array as the key template
 */
class EscapeKeysAndValues extends EscapeBase{}

/**
 * Similar to `keysAndValues`, represents a dictionary of parameter in PostgreSQL intended for
 * use on INSERT queries. However, in this case an "expiresIn" value can be provided that
 * will be used to fill out the "expiresAt" using in-database calculations, resulting in the
 * following form: `(key1, key2, expiresAt) VALUES ($1, $2, now() + $3::interval SECOND)
 */
class EscapeKeysAndValuesWithExpiresIn extends EscapeBase {}

module.exports = {
  EscapeBase,
  EscapeAndDictionary,
  EscapeArrayParameters,
  EscapeDictionary,
  EscapeIdentifier,
  EscapeParameter,
  EscapeKeysAndValues,
  EscapeKeysAndValuesWithExpiresIn,
};
