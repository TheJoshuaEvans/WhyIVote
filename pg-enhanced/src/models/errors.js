const {DatabaseError} = require('pg');

const generateDbErrorMessage = require('./utils/generate-db-error-message.js');

/**
 * General error class used as a base for any other errors
 */
class PgEnhancedError extends Error {
  /**
   * Type string for the error
   */
  type = 'PgEnhancedError';

  constructor(message) {
    super(message);
    this.name = this.type;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error class for errors that originate from PostgreSQL. Will perform various operations on the error
 * to improve feedback for debugging. Also includes a status code property that will be 400 by default,
 * unless a timeout or too-many-connections error is detected in which case a 429 status will be used
 */
class DBError extends PgEnhancedError {
  type = 'DBError';

  /**
   * An HTTP status code associated with this error
   */
  statusCode = 400;

  /**
   * @param {PostgresError} originalError Error directly from the database
   */
  constructor(originalError) {
    // Copy case
    if (originalError instanceof DBError) {
      super(originalError.message);
      this.statusCode = originalError.statusCode;
      this.originalError = originalError.originalError;
      this.stack = originalError.stack;
      return;
    }

    // If this is not a postgres/timeout error, and isn't likely to be an undefined value error,
    // do the bare minimum
    const isDatabaseError = originalError instanceof DatabaseError;
    const couldBeTimeoutError = originalError?.message?.includes('Query read timeout');
    const couldBeUndefinedError = originalError?.message?.includes('UNDEFINED_VALUE') || false;
    if (!isDatabaseError && !couldBeTimeoutError && !couldBeUndefinedError) {
      if (typeof originalError === 'string') {
        originalError = new Error(originalError);
      }

      super(originalError.message);
      this.originalError = originalError;
      return;
    }

    const {
      message, isTimeoutError, isTooManyConnectionsError,
    } = generateDbErrorMessage(originalError);
    super(message);

    // Timeout and to-many-connections errors should give a 429 status code
    if (isTimeoutError || isTooManyConnectionsError) {
      this.statusCode = 429;
    }

    /**
     * The original error from Postgres
     */
    this.originalError = originalError;
  }
}

module.exports = {
  DBError,
};
