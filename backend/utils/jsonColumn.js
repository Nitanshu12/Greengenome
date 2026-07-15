// MariaDB's JSON type is just LONGTEXT with a JSON_VALID() check constraint —
// it has no distinct wire-protocol field type the way real MySQL JSON does,
// so mysql2 never auto-parses it. Every JSON column read back from a query
// arrives as a raw string and must be parsed explicitly; writes still go in
// as JSON.stringify() as usual.
function parseJsonColumn(val) {
  if (val === null || val === undefined) return null;
  if (typeof val !== "string") return val; // already parsed (e.g. a future real-MySQL deployment)
  return JSON.parse(val);
}

module.exports = { parseJsonColumn };
