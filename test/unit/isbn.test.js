const { validateISBN13, validateISBN10, validateISBNChecksum, isCompleteISBN, fixISBN10CheckDigit, isbn13to10 } = require('../../lib/isbn');

describe('ISBN validation', () => {
  describe('validateISBN13', () => {
    test('valid ISBN-13', () => {
      expect(validateISBN13('9780134685991')).toBe(true);
      expect(validateISBN13('9780201633610')).toBe(true);
      expect(validateISBN13('9780596007126')).toBe(true);
    });

    test('invalid ISBN-13 checksum', () => {
      expect(validateISBN13('9780134685992')).toBe(false);
      expect(validateISBN13('9780134685990')).toBe(false);
    });

    test('wrong length', () => {
      expect(validateISBN13('978013468599')).toBe(false);
      expect(validateISBN13('97801346859911')).toBe(false);
    });

    test('non-numeric', () => {
      expect(validateISBN13('978013468599X')).toBe(false);
      expect(validateISBN13('abcdefghijklm')).toBe(false);
    });

    test('empty/null', () => {
      expect(validateISBN13('')).toBe(false);
      expect(validateISBN13(null)).toBe(false);
      expect(validateISBN13(undefined)).toBe(false);
    });
  });

  describe('validateISBN10', () => {
    test('valid ISBN-10', () => {
      expect(validateISBN10('0201633612')).toBe(true);
      expect(validateISBN10('0596007124')).toBe(true);
    });

    test('valid ISBN-10 with X check digit', () => {
      expect(validateISBN10('080442957X')).toBe(true);
    });

    test('valid ISBN-10 with lowercase x', () => {
      expect(validateISBN10('080442957x')).toBe(true);
    });

    test('invalid ISBN-10 checksum', () => {
      expect(validateISBN10('0201633611')).toBe(false);
      expect(validateISBN10('0201633610')).toBe(false);
    });

    test('wrong length', () => {
      expect(validateISBN10('020163361')).toBe(false);
      expect(validateISBN10('02016336121')).toBe(false);
    });

    test('empty/null', () => {
      expect(validateISBN10('')).toBe(false);
      expect(validateISBN10(null)).toBe(false);
    });
  });

  describe('validateISBNChecksum', () => {
    test('valid ISBN-13 with dashes', () => {
      expect(validateISBNChecksum('978-0-13-468599-1')).toBe(true);
    });

    test('valid ISBN-13 with spaces', () => {
      expect(validateISBNChecksum('978 0 13 468599 1')).toBe(true);
    });

    test('valid ISBN-10 with dashes', () => {
      expect(validateISBNChecksum('0-201-63361-2')).toBe(true);
    });

    test('invalid checksum with dashes', () => {
      expect(validateISBNChecksum('978-0-13-468599-2')).toBe(false);
    });

    test('incomplete ISBN', () => {
      expect(validateISBNChecksum('978-0-13')).toBe(false);
      expect(validateISBNChecksum('12345')).toBe(false);
    });

    test('empty string', () => {
      expect(validateISBNChecksum('')).toBe(false);
    });
  });

  describe('isCompleteISBN', () => {
    test('13-digit ISBN is complete', () => {
      expect(isCompleteISBN('9780134685991')).toBe(true);
    });

    test('10-digit ISBN is complete', () => {
      expect(isCompleteISBN('0201633612')).toBe(true);
    });

    test('ISBN with dashes counts only digits', () => {
      expect(isCompleteISBN('978-0-13-468599-1')).toBe(true);
      expect(isCompleteISBN('0-201-63361-2')).toBe(true);
    });

    test('incomplete ISBN', () => {
      expect(isCompleteISBN('978013')).toBe(false);
      expect(isCompleteISBN('')).toBe(false);
    });
  });

  describe('fixISBN10CheckDigit', () => {
    test('computes correct check digit for 9-digit prefix', () => {
      expect(fixISBN10CheckDigit('020163361')).toBe('0201633612');
      expect(fixISBN10CheckDigit('059600712')).toBe('0596007124');
    });

    test('computes X check digit when needed', () => {
      expect(fixISBN10CheckDigit('080442957')).toBe('080442957X');
    });

    test('fixes invalid 10-digit ISBN by recomputing check digit', () => {
      expect(fixISBN10CheckDigit('0201633610')).toBe('0201633612');
      expect(fixISBN10CheckDigit('0201633619')).toBe('0201633612');
    });

    test('handles 9-digit ISBN missing X (user-reported bug: 352210580)', () => {
      const fixed = fixISBN10CheckDigit('352210580');
      expect(fixed).toBeTruthy();
      expect(fixed.length).toBe(10);
      expect(validateISBN10(fixed)).toBe(true);
    });

    test('returns null for invalid input', () => {
      expect(fixISBN10CheckDigit('12345')).toBeNull();
      expect(fixISBN10CheckDigit('abcdefghi')).toBeNull();
      expect(fixISBN10CheckDigit('')).toBeNull();
    });

    test('handles dashes in input', () => {
      expect(fixISBN10CheckDigit('0-201-63361')).toBe('0201633612');
    });
  });

  describe('isbn13to10', () => {
    test('converts valid 978 ISBN-13 to ISBN-10', () => {
      const result = isbn13to10('9780201633610');
      expect(result).toBe('0201633612');
    });

    test('returns null for non-978 prefix', () => {
      expect(isbn13to10('9790000000000')).toBeNull();
    });

    test('returns null for wrong length', () => {
      expect(isbn13to10('978020163')).toBeNull();
    });

    test('returns null for null/empty', () => {
      expect(isbn13to10(null)).toBeNull();
      expect(isbn13to10('')).toBeNull();
    });
  });
});
