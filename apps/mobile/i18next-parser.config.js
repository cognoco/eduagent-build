/** @type {import('i18next-parser').UserConfig} */
module.exports = {
  locales: ['en'],
  output: 'src/i18n/locales/$LOCALE.json',
  input: ['src/**/*.{ts,tsx}'],
  sort: true,
  createOldCatalogs: false,
  keySeparator: '.',
  namespaceSeparator: false,
  defaultNamespace: 'translation',
  useKeysAsDefaultValue: false,
  verbose: true,
};
