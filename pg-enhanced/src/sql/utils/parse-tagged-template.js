/** @typedef {import('pg').QueryConfig} QueryConfig */

const pg = require('pg');

const {
  EscapeBase,
  EscapeAndDictionary,
  EscapeArrayParameters,
  EscapeDictionary,
  EscapeIdentifier,
  EscapeParameter,
  EscapeKeysAndValues,
  EscapeKeysAndValuesWithExpiresIn,
} = require('../clients/escape-clients.js');

/**
 * Takes the same arguments as a tagged template literal and parses them into a query config
 * object that can be passed directly to a pg query function
 *
 * @param {string[]} strings Array of string pieces
 * @param {*[]} args Values to place in between the string pieces
 *
 * @returns {QueryConfig} The parsed query config object
 */
const parseTaggedTemplate = (strings, ...args) => {
  let text = '';
  let values = [];

  // Step through the strings, combining and parsing args as we go
  strings.forEach((stringSegment, index) => {
    text += stringSegment;

    if (typeof args[index] !== 'undefined') {
      let arg = args[index];

      if (arg instanceof EscapeBase && typeof arg.value === 'undefined') {
        return;
      }

      if (arg instanceof EscapeAndDictionary) {
        // Parse parameter dictionaries into the form:
        // `AND key1=$1 AND key2=$2`
        // while adding the appropriate values to the `values` array
        const dictionary = arg.value;

        const dictStrings = [];
        for (const key in dictionary) {
          const value = dictionary[key];

          if (typeof value === 'undefined') {
            continue;
          }

          values.push(value);
          dictStrings.push(` AND ${pg.escapeIdentifier(key)}=$${values.length}`);
        }

        arg = dictStrings.join('');

      } else if (arg instanceof EscapeArrayParameters) {
        // Parse parameterized arrays into the form:
        // `ARRAY[$1, $2]`
        // while adding the appropriate values to the `values` array
        const arr = arg.value;

        const paramIndexes = [];
        for (const value of arr) {
          values.push(value);
          paramIndexes.push('$' + values.length);
        }

        arg = `ARRAY[${paramIndexes.join(', ')}]`;

      } else if (arg instanceof EscapeDictionary) {
        // Parse parameter dictionaries into the form:
        // `key1=$1, key2=$2`
        // while adding the appropriate values to the `values` array
        const dictionary = arg.value;

        const dictStrings = [];
        for (const key in dictionary) {
          values.push(dictionary[key]);
          dictStrings.push(`${pg.escapeIdentifier(key)}=$${values.length}`);
        }

        arg = dictStrings.join(', ');

      } else if (arg instanceof EscapeIdentifier) {
        // Parse identifiers using the `pg.escapeIdentifiers` method
        let argValue = arg.value;
        if (!Array.isArray(argValue)) {
          argValue = [argValue];
        }

        arg = argValue.map(v => pg.escapeIdentifier(v)).join(', ');

      } else if (arg instanceof EscapeParameter) {
        // Parse parameters by adding the argument to the values array and applying param index
        values.push(arg.value);
        arg = `$${values.length}`;

      } else if (arg instanceof EscapeKeysAndValues) {
        // Parse parameter dictionaries into the form:
        // `(key1, key2) VALUES ($1, $2), ($3, $4)`
        // while adding the appropriate values to the `values` array
        let argValues = arg.value;

        if (!Array.isArray(argValues)) {
          argValues = [argValues];
        }

        // Use the first item as the template for the rest
        const keys = Object.keys(argValues[0]);
        const rowKeys = keys.map(key => pg.escapeIdentifier(key));
        let rowValues = [];
        let paramIndexGroups = [];

        argValues.forEach((argValue) => {
          rowValues = [...rowValues, ...keys.map(key => argValue[key])];
          paramIndexGroups.push(keys.map((k, i) => {
            return `$${(paramIndexGroups.length * keys.length) + i + 1}`;
          }));
        });

        // Stringify the param index groups
        paramIndexGroups = paramIndexGroups.map((paramIndexGroup) => {
          return `(${paramIndexGroup.join(',')})`;
        });

        arg = `(${rowKeys.join(',')}) VALUES ${paramIndexGroups.join(',')}`;
        values = [...values, ...rowValues];

      } else if (arg instanceof EscapeKeysAndValuesWithExpiresIn) {
        // Parse parameter dictionaries into the form:
        // `(key1, key2, expiresAt) VALUES ($1, $2, now() + $3::interval SECOND)`
        // while adding the appropriate values to the `values` array
        const argValue = {...arg.value};

        let expiresIn = undefined;
        if (argValue.expiresIn) {
          expiresIn = argValue.expiresIn;
          delete argValue.expiresIn;
          delete argValue.expiresAt;
          delete argValue.expiresAtEpoch;
        }

        const keys = Object.keys(argValue);
        const rowKeys = keys.map(key => pg.escapeIdentifier(key));
        const rowValues = keys.map(key => argValue[key]);

        let index = 0;
        const paramIndexes = keys.map((key, i) => {
          index = i+1;
          return `$${index}`;
        });

        if (expiresIn) {
          rowKeys.push(pg.escapeIdentifier('expiresAt'));
          rowValues.push(expiresIn);
          paramIndexes.push(/*sql*/`now() + $${index+1}::interval SECOND`);

          rowKeys.push(pg.escapeIdentifier('expiresAtEpoch'));
          rowValues.push(expiresIn);
          paramIndexes.push(/*sql*/`FLOOR(EXTRACT(EPOCH FROM NOW())) + $${index+2}`);
        }

        arg = `(${rowKeys.join(', ')}) VALUES (${paramIndexes.join(', ')})`;
        values = [...values, ...rowValues];


      } else if (typeof arg === 'object') {
        // Any other kind of object should just be stringified
        arg = JSON.stringify(arg);
      }

      text += arg;
    }
  });

  const result = {
    text, values: values.length ? values : undefined,
  };

  return result;
};

module.exports = parseTaggedTemplate;
