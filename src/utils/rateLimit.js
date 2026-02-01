/**
 * Pauses execution for a specified number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = {
    delay
};
