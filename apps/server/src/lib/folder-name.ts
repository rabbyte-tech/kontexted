const kebabCasePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const snakeCasePattern = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const camelCasePattern = /^[a-z][a-z0-9]*([A-Z][a-z0-9]*)*$/;
const pascalCasePattern = /^[A-Z][a-z0-9]*([A-Z][a-z0-9]*)*$/;

export const isValidFolderName = (name: string) =>
  kebabCasePattern.test(name) ||
  snakeCasePattern.test(name) ||
  camelCasePattern.test(name) ||
  pascalCasePattern.test(name);
