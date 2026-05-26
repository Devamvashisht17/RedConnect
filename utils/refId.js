/** Normalize ObjectId, populated doc, or string ref to hex string. */
function refId(ref) {
  if (ref == null) return '';
  if (typeof ref === 'object' && ref._id != null) return ref._id.toString();
  return ref.toString();
}

module.exports = { refId };
