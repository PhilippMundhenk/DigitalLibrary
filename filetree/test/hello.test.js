const csvParse = require('./mocks/csv-parse-sync');

test('hello world!', () => {
	expect(csvParse).toBeDefined();
});