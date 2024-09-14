/**
 * Configuration object for values used only in testing
 */
const testConfig = {

  /**
   * @type {number}
   * Maximum number of times to try connecting to the database in setup before giving up
   */
  SETUP_RETRY_LIMIT: Number(process.env.SETUP_RETRY_LIMIT) || 10,

  /**
   * @type {number}
   * Amount of time in ms to wait between each database connection test attempt
   */
  SETUP_WAIT_TIME_MS: Number(process.env.SETUP_WAIT_TIME_MS) || 1000,
};

module.exports = testConfig;
