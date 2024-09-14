/**
 * @typedef ExamineFilterKeysResults
 * @property {boolean} areEmptyStringFilterKeys `true` if any of the values on the filter keys
 *  object are empty strings
 * @property {boolean} areFilterKeysEmpty `true` if the filter keys object has no keys
 * @property {boolean} areFilterKeysFalsy `true` if the filter keys object itself is missing or
 *  otherwise falsy
 * @property {boolean} areAllFilterKeysUndefined `true` if the filter keys object has keys, but
 *  all values are `undefined`
 */

/**
 * Takes an object being used as a set of filter or primary keys and examines if for specific
 * traits
 *
 * @param {object} filterKeys
 *
 * @returns {ExamineFilterKeysResults}
 */
const examineFilterKeys = (filterKeys) => {
  const areFilterKeysFalsy = !filterKeys ? true : false;
  const areFilterKeysEmpty = !areFilterKeysFalsy &&
    Object.keys(filterKeys).length === 0 ? true : false
  ;

  let areEmptyStringFilterKeys = false;
  let areAllFilterKeysUndefined = true;
  for (const key in filterKeys) {
    if (filterKeys[key] === '') {
      areEmptyStringFilterKeys = true;
    }
    if (typeof filterKeys[key] !== 'undefined') {
      areAllFilterKeysUndefined = false;
      break;
    }
  }

  return {
    areEmptyStringFilterKeys,
    areFilterKeysEmpty,
    areFilterKeysFalsy,
    areAllFilterKeysUndefined,
  };
};

module.exports = examineFilterKeys;
