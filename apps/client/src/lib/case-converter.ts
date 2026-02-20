const VALID_CONVENTIONS = ["kebab-case", "camelCase", "snake_case", "PascalCase"] as const;

export type NamingConvention = (typeof VALID_CONVENTIONS)[number];

/**
 * Type guard to validate naming convention values.
 */
export const isValidNamingConvention = (
  value: string
): value is NamingConvention => {
  return (VALID_CONVENTIONS as readonly string[]).includes(value);
};

/**
 * Returns the default naming convention.
 */
export const getDefaultNamingConvention = (): NamingConvention => {
  return "kebab-case";
};

/**
 * Converts a string to the specified naming convention.
 *
 * @param input - The input string to convert
 * @param convention - The target naming convention
 * @returns The converted string in the specified convention
 */
export const convertToNamingConvention = (
  input: string,
  convention: NamingConvention
): string => {
  // Handle empty or whitespace-only input
  if (!input || !input.trim()) {
    return "";
  }

  // Step 1: Normalize Unicode - decompose accented characters to base form
  // é → e, ñ → n, etc.
  let result = input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // Step 2: Remove non-alphanumeric characters (keep spaces and hyphens)
  result = result.replace(/[^a-zA-Z0-9\s-]/g, "");

  // Step 3: Normalize whitespace - replace multiple spaces/hyphens with single space
  result = result.replace(/[\s-]+/g, " ").trim();

  // Step 4: Split into words - handle various separators and camelCase/PascalCase boundaries
  const words = result.split(/[\s\-_]+|(?=[A-Z])/).filter(Boolean);

  // Step 5: Apply convention-specific transformation
  switch (convention) {
    case "kebab-case":
      return words.map((w) => w.toLowerCase()).join("-");

    case "camelCase":
      return words
        .map((w, i) => {
          const lower = w.toLowerCase();
          if (i === 0) {
            return lower;
          }
          if (w.length === 0) {
            return lower;
          }
          return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        })
        .join("");

    case "snake_case":
      return words.map((w) => w.toLowerCase()).join("_");

    case "PascalCase":
      return words
        .map((w) => {
          const lower = w.toLowerCase();
          if (w.length === 0) {
            return lower;
          }
          return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        })
        .join("");

    default:
      // This should never happen due to type safety
      return "";
  }
};
