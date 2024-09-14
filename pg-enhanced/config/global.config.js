/**
 * Configurations and magic values that are defined globally for the whole project. These values can be
 * configured using environment variables or by providing a configuration object when creating a new
 * client
 */
const globalConfig = {
  /**
   * @type {'IGNORE_ERROR'|'LOG_ERROR'|'RUNTIME_ERROR'}
   * What to do if the most recent x-ray context cannot be found
   */
  AWS_XRAY_CONTEXT_MISSING_STRATEGY: process.env.AWS_XRAY_CONTEXT_MISSING_STRATEGY || 'IGNORE_ERROR',

  /**
   * @type {Boolean}
   * If AWS Xray should be used. Default on, set to the explicit string "false" to deactivate
   */
  AWS_XRAY_ENABLED: process.env.AWS_XRAY_ENABLED !== 'false',

  /**
   * @type {string}
   * Log level for AWS Xray
   */
  AWS_XRAY_LOG_LEVEL: process.env.AWS_XRAY_LOG_LEVEL || 'silent',

  /**
   * @type {Boolean}
   * If detailed SQL query data should be logged whenever a query is sent. Useful for debugging in certain
   * scenarios. Set to the explicit string `true` to activate
   */
  PG_ENHANCED_LOG_SQL: process.env.PG_ENHANCED_LOG_SQL === 'true',

  /**
   * @type {string}
   * Name of the database used to store data. Default is "main"
   */
  POSTGRES_DATABASE: process.env.POSTGRES_DATABASE || 'main',

  /**
   * @type {string}
   * Host for the PostgreSQL server. Default is "localhost"
   */
  POSTGRES_HOST: process.env.POSTGRES_HOST || 'localhost',

  /**
   * @type {string}
   * Password for the PostgreSQL user. Default is "postgres"
   */
  POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD || 'postgres',

  /**
   * @type {number}
   * Port for the PostgreSQL server. Default is 5432
   */
  POSTGRES_PORT: Number(process.env.POSTGRES_PORT) || 5432,

  /**
   * @type {string}
   * Username to use when connecting to the PostgreSQL server. Default is "postgres"
   */
  POSTGRES_USER: process.env.POSTGRES_USER || 'postgres',
};

module.exports = globalConfig;
