const awsXray = require('aws-xray-sdk-core');

const global = require('../../config/global.config.js');

/**
 * Initialize the global X-Ray module
 */
const initXray = () => {
  // Set the aws log level in the process env, in case it wasn't already set. The AWS XRay SDK
  // uses environment variables for configuration rather than passed objects
  process.env.AWS_XRAY_LOG_LEVEL = global.AWS_XRAY_LOG_LEVEL;

  // Aso set the context missing strategy
  awsXray.setContextMissingStrategy(global.AWS_XRAY_CONTEXT_MISSING_STRATEGY);
};

module.exports = initXray;
