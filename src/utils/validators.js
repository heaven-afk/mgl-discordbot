/**
 * Validates if a string is a valid Snowflake ID.
 * @param {string} id
 * @returns {boolean}
 */
const isValidSnowflake = (id) => /^(\d{17,20})$/.test(id);

/**
 * Validates message movement parameters.
 * @param {number} limit
 * @returns {boolean}
 */
const isValidLimit = (limit) => limit >= 1 && limit <= 100;

module.exports = {
  isValidSnowflake,
  isValidLimit
};
