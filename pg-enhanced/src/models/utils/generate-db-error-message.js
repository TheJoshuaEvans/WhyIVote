/** @typedef {import('pg').DatabaseError} DatabaseError */

/**
 * Takes a query string and attempts to retrieve the query method (SELECT, INSERT, etc)
 * @param {string} queryString The query string to get the method from
 */
const getQueryMethod = (queryString) => {
  // The query method should be the first word in the query, but there might be a new line
  // character at the beginning of the string because of how it's formatted in code, so strip
  // out all words that are only a single character
  return queryString.split(' ').filter(s => s.length > 1)[0];
};

/**
 * @typedef DatabaseErrorExtras
 * @property {string} query The query that caused the error
 * @property {object[]} parameters The parameters provided with the query
 */

/**
 * @typedef GenerateDbErrorMessageResults
 * @property {string} message The detailed message appropriate for this error
 * @property {boolean} isTimeoutError If this has been determined to be a timeout error
 * @property {boolean} isTooManyConnectionsError If this has been determined to be a too many
 *  connections error
 */

/**
 * Takes an error from pg and returns an improved message string that's a bit more user-friendly.
 * Note: pg doesn't add `query` or `parameters` to the error object automatically, so that must be
 * performed manually for this method to work fully
 *
 * @param {DatabaseError & DatabaseErrorExtras} error
 *
 * @returns {GenerateDbErrorMessageResults} Error message and some additional helpful info
 */
const generateDbErrorMessage = (error) => {
  const errorDetail = error.detail;
  const errorMessage = error.message;
  const errorParameters = error.parameters;
  const errorQuery = error.query || '';
  const errorTable = error.table || '';

  /** @type {GenerateDbErrorMessageResults} */
  const results = {
    message: `Unrecognized Database Error: ${errorMessage}. Detail: ${errorDetail}`,
    isTimeoutError: false,
    isTooManyConnectionsError: false,
  };

  // ---- Perform REGEX Evaluations ----
  // Evaluations are performed in sequence, and should be approximately listed in order of most
  // to least common - since REGEX can be expensive in some cases. Function returns are used
  // to prevent unnecessary error message processing

  // Error message analysis is used instead of the error codes, because the same error code
  // can refer to errors that give different messages (and are, arguably, different error
  // cases). For example, the `deleteFk` and `insertFk` messages both originate from error
  // code 23503 (foreign_key_violation)

  // -- Too Many Clients --
  // The database is having trouble scaling and is too busy to handle the request right now. It's also
  // very sorry about it
  const tooManyClientsRegex = /^sorry, too many clients already$/;
  const tooManyClientsResult = tooManyClientsRegex.exec(errorMessage);
  if (tooManyClientsResult) {
    results.message = `Too many database connections, try again later. Running query: ${errorQuery.replace(/\n/g, '')}`;
    results.isTooManyConnectionsError = true;
    return results;
  }

  // -- Query Timeout --
  // A query went on too long as was timed out by the `pg` client. This is just a regular Error
  // emitted by the client, rather than a proper DatabaseError, so the info available to us is
  // somewhat limited
  const queryTimeoutRegex = /^Query read timeout$/;
  const queryTimeoutResult = queryTimeoutRegex.exec(errorMessage);
  if (queryTimeoutResult) {
    results.message = `Query timed out. Running query: ${errorQuery.replace(/\n/g, '')}`;
    results.isTimeoutError = true;
    return results;
  }

  // -- Foreign Key Violation - Bad Delete --
  // There was a foreign key violation on either update or delete (probably delete). This
  // happens most commonly when attempting to delete an item that other items in other tables
  // are still pointing to
  const deleteFkRegex = /^update or delete on table "(.+?)" violates foreign key constraint ".+?" on table "(.+?)"$/;
  const deleteFkResult = deleteFkRegex.exec(errorMessage);
  if (deleteFkResult) {
    // Get the table being touched, from the regex result...
    const touchedTable = deleteFkResult[1];

    // ...and the request method from the query itself. It's probably DELETE, but - as the raw
    // error suggests, this can happen on UPDATE, apparently.
    const queryMethod = getQueryMethod(errorQuery);

    results.message = `Could not ${queryMethod} item from "${touchedTable}" table. Detail: ` + errorDetail;
    return results;
  }

  // -- Foreign Key Violation - Bad Insert --
  // There was a foreign key violation on either insert or update. Most often caused when
  // trying to insert an item with invalid foreign key values, such as a "book" pointing to an
  // "author" via an `authorId` that doesn't exist
  const insertFkRegex = /^insert or update on table "(.+?)" violates foreign key constraint "(.+?)"$/;
  const insertFkResult = insertFkRegex.exec(errorMessage);
  if (insertFkResult) {
    // Get the table being touched, from the regex result...
    const touchedTable = insertFkResult[1];

    // ...and an identifier for the item. It's not guaranteed to actually be the item's logical
    // ID, but the first parameter should be important...
    const itemId = errorParameters[0];

    // ...and the request method from the query itself. It's probably INSERT, but it can also
    // easily happen on UPDATE.
    const queryMethod = getQueryMethod(errorQuery);

    results.message = `Could not ${queryMethod} item "${itemId}" into "${touchedTable}" table. Detail: ` + errorDetail;
    return results;
  }

  // -- Duplicate Key Error --
  // There is a duplicate key preventing an insert or update. This happens when any unique
  // constraint is broken - such as trying to insert an author with an id or name that is
  // already taken
  const duplicateKeyRegex = /^duplicate key value violates unique constraint "(.+?)"$/;
  const duplicateKeyResult = duplicateKeyRegex.exec(errorMessage);
  if (duplicateKeyResult) {
    // Get the table being touched, from the error itself...
    const touchedTable = errorTable;

    // ...and an identifier for the item. It's not guaranteed to actually be the item's logical
    // ID, but the first parameter should be important...
    let itemId = errorParameters[0];

    if (typeof itemId === 'object') {
      itemId = JSON.stringify(itemId);
    }

    // ...and the request method from the query itself. It's probably INSERT, but it can also
    // easily happen on UPDATE.
    const queryMethod = getQueryMethod(errorQuery);

    results.message = `Could not ${queryMethod} item "${itemId}" into "${touchedTable}" table. Detail: ` + errorDetail;
    return results;
  }

  // -- Value Too Long --
  // A provided value was too long. This error could be arbitrarily common - since it's up to
  // the users to test these limits. Though, there should probably be checks long before this
  // point that will prevent this from happening on the database level. The information provided
  // in the PostgresError in this case is particularly unhelpful
  const tooLongRegex = /^value too long for type (.+?)$/;
  const tooLongResult = tooLongRegex.exec(errorMessage);
  if (tooLongResult) {
    // Try to get the query method, as well as the table being touched by analyzing the
    // query. This is probably caused by a UPDATE or INSERT request, so it should be
    // fairly predictable...
    const analyzeQueryResult = /(UPDATE|INSERT).+?"(.+?)"/.exec(errorQuery);
    if (!analyzeQueryResult) {
      return results;
    }
    const [, queryMethod, touchedTable] = analyzeQueryResult;

    // ...and get the data type from the original regex execution
    const dataType = tooLongResult[1];

    results.message = `Could not ${queryMethod} item into "${touchedTable}" table. A value is too long for db type "${dataType}".`;
    return results;
  }

  // -- Missing Table --
  // A "relation" is missing. Probably referring to a missing table
  const missingRelationRegex = /^relation "(.+?)" does not exist$/;
  const missingRelationResult = missingRelationRegex.exec(errorMessage);
  if (missingRelationResult) {
    // Get the "table" being touched, from the regex result...
    const touchedTable = missingRelationResult[1];

    // ...and the request method from the query itself. It could be anything, really
    const queryMethod = getQueryMethod(errorQuery);

    results.message = `Could not perform ${queryMethod} operation on missing table "${touchedTable}".`;
    return results;
  }

  // -- Null Values --
  // A column marked as NOT NULL is being set to null
  const nullValuesRegex = /^null value in column "(.+?)" violates not-null constraint$/;
  const nullValuesResult = nullValuesRegex.exec(errorMessage);
  if (nullValuesResult) {
    const badColumn = nullValuesResult[1];
    const queryMethod = getQueryMethod(errorQuery);

    results.message = `Could not ${queryMethod} item in "${errorTable}" table. Unexpected null value for "${badColumn}" column.`;

    return results;
  }

  // -- Undefined Values --
  // A value provided to the SDK is undefined. It's special in that it's not a Postgres Error emitted
  // by the database, but is instead a regular JS Error thrown by the SDK
  const undefinedValuesRegex = /^UNDEFINED_VALUE: Undefined values are not allowed$/;
  const undefinedValuesResult = undefinedValuesRegex.exec(errorMessage);
  if (undefinedValuesResult) {
    const args = error?.args;
    results.message = 'Unexpected undefined value applying data to database. ' +
      `Args: ${JSON.stringify(args)}.`
    ;
    return results;
  }

  return results;
};

module.exports = generateDbErrorMessage;
