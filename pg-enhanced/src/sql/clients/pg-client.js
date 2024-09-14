const awsXraySdk = require('aws-xray-sdk');
const pg = require('pg');

const Cursor = require('pg-cursor');
const { DBError } = require('../../models/errors.js');
const {
  EscapeAndDictionary,
  EscapeArrayParameters,
  EscapeDictionary,
  EscapeIdentifier,
  EscapeParameter,
  EscapeKeysAndValues,
  EscapeKeysAndValuesWithExpiresIn,
} = require('./escape-clients.js');

const globalConfig = require('../../../config/global.config.js');
const parseTaggedTemplate = require('../utils/parse-tagged-template.js');
const initXray = require('../../xray/init-xray.js');

/**
 * Helpful escape wrappers
 */
const escape = {
  /**
   * Represents a dictionary of parameters in PostgreSQL meant to be used in a WHERE clause. Will
   * be parsed into separate parameterized values joined by an AND statement in the form
   * `AND key1=$1 AND key2=$2`
   *
   * @param {object} item Object to use as the dictionary
   */
  andDictionary: (item) => new EscapeAndDictionary(item),

  /**
   * Represents an array of parameters, to be rendered as a parameterized [literal array](https://www.postgresql.org/docs/current/arrays.html#ARRAYS-INPUT)
   * in the final SQL. Example: `ARRAY[$1, $2, $3]`
   *
   * @param {object} item Object to use as the dictionary
   */
  arrayParameters: (item) => new EscapeArrayParameters(item),

  /**
   * Represents a dictionary of parameters in PostgreSQL. Will be parsed into separate
   * parameterized values for each key-value pair in the dictionary object in the form
   * `key1=$1, key2=$2`
   *
   * @param {object} item Object to use as the dictionary
   */
  dictionary: (item) => new EscapeDictionary(item),

  /**
   * Represents an "Identifier" in PostgreSQL. Will be parsed using the [pg.escapeIdentifier](https://node-postgres.com/apis/utilities#pgescapeidentifier)
   * method, which mostly means the value will be surrounded in double quotes in the final query
   *
   * @param {*} item The item to escape as an identifier
   */
  identifier: (item) => new EscapeIdentifier(item),

  /**
   * Represents a "Parameter" in PostgreSQL. Will be parsed into a parameter index (`$1`, `$2`,
   * etc) and an accompanying value in the `values` array
   *
   * @param {*} item The item to parameterize
   */
  parameter: (item) => new EscapeParameter(item),

  /**
   * Represents a dictionary of parameters in PostgreSQL intended for use on INSERT queries. Will
   * be parsed into separate parameterized values for each key-value pair in the dictionary object,
   * in `(key1,key2) VALUES ($1,$2)` form. If an array of dictionary objects are provided, the
   * result will be in the form `(key1,key2) VALUES ($1,$2),($3,$4)`, using the first object in
   * the array as the key template
   *
   * @param {object|object[]} item Object to use as the key and value dictionary
   */
  keysAndValues: (item) => new EscapeKeysAndValues(item),

  /**
   * Similar to `keysAndValues`, represents a dictionary of parameter in PostgreSQL intended for
   * use on INSERT queries. However, in this case an "expiresIn" value can be provided that
   * will be used to fill out the "expiresAt" using in-database calculations, resulting in the
   * following form: `(key1, key2, expiresAt) VALUES ($1, $2, now() + $3::interval SECOND)
   *
   * @param {object} item Object to use as the key and value dictionary
   */
  keysAndValuesWithExpiresIn: (item) => new EscapeKeysAndValuesWithExpiresIn(item),
};

/**
 * Wrapper client for `pg` that provides enhanced functionality
 */
class PgClient {
  // ---- STATIC ----
  /**
   * @private
   * Global list of clients that are currently open (that is, `connect` has been run on them)
   */
  static _openClients = [];

  /**
   * Error classes thrown when there are errors
   */
  static errors = {DBError};

  // -- Static Methods --
  /**
   * @private
   * Closes a client by calling `end` and removes it from the open clients array
   *
   * @param {PgClient} client The client to close
   */
  static async _closeClient(client) {
    const clientIndex = PgClient._openClients.indexOf(client._pgClient);
    if (clientIndex !== -1) {
      PgClient._openClients.splice(clientIndex, 1);
    }
    client.hasClosed = true;
    return client._pgClient.end();
  }

  /**
   * Wrappers that are useful for escaping dynamic query string values
   */
  static escape = escape;

  // ---- INSTANCED ----
  /**
   * @private
   * If this client should be included in the system that automatically closes open connections
   */
  _autoClose = true;

  /**
   * @private
   * Internally identifies if the client has connected to the PostgreSQL server
   */
  _hasConnected = false;

  /**
   * @private
   * @type {PgClientOpts}
   * Internal record of the option values used on instantiation
   */
  _opts;

  /**
   * @private
   * @type {pg.Client}
   * Internal `pg` client used to make requests
   */
  _pgClient;

  /**
   * @private
   * @type {pg.ClientConfig}
   * Internal record of the config values used on instantiation
   */
  _pgConfig;

  /**
   * Wrappers that are useful for escaping dynamic query string values
   */
  escape = escape;

  /**
   * If this client has been closed
   */
  hasClosed = false;

  /**
   * @typedef PgClientOpts
   * Additional options for generating a PgClient instance
   * @property {bool=} autoClose If this client should be included in the automatic open client
   *  closing system when running in a test environment
   * @property {awsXray=} awsXray AWS XRay lib to use when performing tracing operations
   * @property {awsXray.SegmentLike=} segment Segment to capture the `pg` client under. Will
   *  not be captured if this value is not provided
   */

  /**
   * @param {pg.ClientConfig} pgConfig Configurations to pass to the internal client on creation
   * @param {PgClientOpts} opts Additional options
   */
  constructor(pgConfig = {}, opts = {}) {
    const {autoClose = true, awsXray = awsXraySdk, segment = null} = opts;

    this._autoClose = autoClose;

    // Apply default configurations
    pgConfig = {
      host: globalConfig.POSTGRES_HOST,
      port: globalConfig.POSTGRES_PORT,
      database: globalConfig.POSTGRES_DATABASE,
      user: globalConfig.POSTGRES_USER,
      password: globalConfig.POSTGRES_PASSWORD,
      ...pgConfig,
    };

    // Save configurations
    this._pgConfig = pgConfig;
    this._opts = opts;

    // Handle AWS Xray
    const ClientClass = segment ?
      awsXray.capturePostgres(pg, segment).Client :
      pg.Client
    ;

    const client = new ClientClass(pgConfig);
    this._pgClient = client;
  }

  // -- Instance Methods --
  /**
   * @typedef PgClientCaptureParams
   * @property {awsXraySdk.SegmentLike} segment The parent segment to capture requests under
   * @property {awsXraySdk=} awsXray AWS Xray library to use for performing the capture
   * @property {pg.ClientConfig} pgConfig Configurations to pass to the internal client
   */

  /**
   * Capture requests under a given parent segment using AWS Xray. Operates by closing the current
   * client and creating a new one, so this method _must not_ be called while queries are in flight
   *
   * @param {PgClientCaptureParams} params
   */
  async capture(params) {
    const {segment, awsXray = awsXraySdk, pgConfig = this._pgConfig} = params;

    await PgClient._closeClient(this);

    const capturedPg = awsXray.capturePostgres(pg, segment);
    this.hasClosed = false;
    this._hasConnected = false;
    this._pgClient = new capturedPg.Client(pgConfig);
  }

  /**
   * Connect to the SQL server
   */
  async connect() {
    if (!this._hasConnected) {
      const log = {...this._pgConfig};
      delete log.password;
      tryConnect: try {
        await this._pgClient.connect();
      } catch (e) {
        // -- Connection Error Handling --
        // Under extremely high load there can be delays that cause connections to be made more
        // then once. If this happens, ignore the error
        if (e.message.includes('Client has already been connected')) {
          break tryConnect;
        }

        throw e;
      }
      this._hasConnected = true;

      if (this._autoClose) {
        PgClient._openClients.push(this._pgClient);
      }
    }
  }

  /**
   * Disconnect form the SQL sever
   */
  async end() {
    return PgClient._closeClient(this);
  }

  /**
   * Perform a query, lazily connecting to the database if a connection has not already been
   * established
   *
   * @param {pg.QueryConfig | string} params
   * @param {*[]=} values
   */
  async query(params, values = undefined) {
    let queryConfig = params;

    // Support the overloaded method form where a string and values are provided separately
    if (typeof params === 'string') {
      queryConfig = {text: params, values};
    }

    if (globalConfig.PG_ENHANCED_LOG_SQL === true) {
      console.log(JSON.stringify({
        message: 'detailed-sql-log',
        queryConfig,
      }));
    }

    try {
      await this.connect();
    } catch(e) {
      e.query = queryConfig.text;
      e.parameters = queryConfig.values;
      throw new DBError(e);
    }

    let queryResult;
    try {
      queryResult = await this._pgClient.query(queryConfig);
    } catch(e) {
      e.query = queryConfig.text;
      e.parameters = queryConfig.values;
      throw new DBError(e);
    }

    // Set up and return results
    const results = queryResult.rows;
    results.originalResults = {
      ...queryResult, rows: undefined,
    };
    results.query = queryConfig.text;
    results.parameters = queryConfig.values;
    return results;
  }

  /**
   * Perform a query, lazily connecting to the database if a connection has not already been
   * established, and returning a cursor that can be used to page through the query results
   *
   * NOTE: Until the cursor is closed using `cursor.close()` the cursor will "lock" the client
   *       and prevent additional queries from succeeding
   *
   * @param {pg.QueryConfig | string} params
   * @param {*[]=} values
   *
   * @returns {import('pg-cursor')}
   */
  async cursorQuery(params, values = undefined) {
    // Support the overloaded method form where a string and values are provided separately
    let queryConfig = params;
    if (typeof params === 'string') {
      queryConfig = {text: params, values};
    }

    try {
      await this.connect();
    } catch(e) {
      e.query = queryConfig.text;
      e.parameters = queryConfig.values;
      throw new DBError(e);
    }

    let resultCursor;
    try {
      resultCursor = await this._pgClient.query(new Cursor(queryConfig.text, queryConfig.values));
    } catch(e) {
      e.query = queryConfig.text;
      e.parameters = queryConfig.values;
      throw new DBError(e);
    }

    return resultCursor;
  }

  /**
   * Automatically parse and run a provided SQL query. This method is meant to be used as a
   * [tagged template](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#tagged_templates)
   *
   * @template
   * @param {string[]} strings Array of string parts
   * @param  {...any} args Arguments that go in between the string parts
   */
  async sql(strings, ...args) {
    return this.query(parseTaggedTemplate(strings, ...args));
  }

  /**
   * Automatically parse and run a provided SQL query, returning a cursor that can be used to
   * page through results. This method is meant to be used as a
   * [tagged template](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals#tagged_templates)
   *
   * @template
   * @param {string[]} strings Array of string parts
   * @param  {...any} args Arguments that go in between the string parts
   */
  async cursorSql(strings, ...args) {
    return this.cursorQuery(parseTaggedTemplate(strings, ...args));
  }
}

// If there is a globally scoped `afterAll` method, use it to automatically end the client
// connection for tests. Also use the opportunity to initialize the xray client so that it
// doesn't yell at us when we are testing :(
if (global.afterAll && typeof global.afterAll === 'function') {
  initXray();

  global.afterAll(async () => {
    for (const client of PgClient._openClients) {
      await client.end();
    }
    PgClient._openClients = [];
  });
}

module.exports = PgClient;
