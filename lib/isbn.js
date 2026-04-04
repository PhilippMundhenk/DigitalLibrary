// ISBN validation utilities — shared between server and client

function validateISBN13(code) {
  if (!code || code.length !== 13 || !/^\d{13}$/.test(code)) return false;
  var sum = 0;
  for (var i = 0; i < 12; i++) sum += parseInt(code[i], 10) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === parseInt(code[12], 10);
}

function validateISBN10(code) {
  if (!code || code.length !== 10 || !/^[\dXx]{10}$/.test(code)) return false;
  var sum = 0;
  for (var i = 0; i < 9; i++) sum += parseInt(code[i], 10) * (i + 1);
  var check = sum % 11;
  var last = code[9].toUpperCase() === 'X' ? 10 : parseInt(code[9], 10);
  return check === last;
}

function validateISBNChecksum(raw) {
  var clean = raw.replace(/[\s\-]/g, '');
  if (clean.length === 13) return validateISBN13(clean);
  if (clean.length === 10) return validateISBN10(clean);
  return false;
}

function isCompleteISBN(raw) {
  var clean = raw.replace(/[\s\-]/g, '');
  return clean.length === 10 || clean.length === 13;
}

// Compute correct ISBN-10 check digit for a 9-digit prefix.
// Returns the full 10-char ISBN string, or null if input is invalid.
function fixISBN10CheckDigit(raw) {
  var digits = raw.replace(/[\s\-]/g, '');
  // If it's 9 digits, compute and append check digit
  if (/^\d{9}$/.test(digits)) {
    var sum = 0;
    for (var i = 0; i < 9; i++) sum += parseInt(digits[i], 10) * (i + 1);
    var check = sum % 11;
    return digits + (check === 10 ? 'X' : String(check));
  }
  // If it's already 10 chars but invalid, try recomputing check digit
  if (/^\d{9}[\dXx]$/.test(digits) && !validateISBN10(digits)) {
    return fixISBN10CheckDigit(digits.slice(0, 9));
  }
  return null;
}

// Convert ISBN-13 to ISBN-10 if it's a 978- prefix book ISBN
function isbn13to10(isbn13) {
  if (!isbn13 || isbn13.length !== 13 || !isbn13.startsWith('978')) return null;
  return fixISBN10CheckDigit(isbn13.slice(3, 12));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { validateISBN13, validateISBN10, validateISBNChecksum, isCompleteISBN, fixISBN10CheckDigit, isbn13to10 };
}
