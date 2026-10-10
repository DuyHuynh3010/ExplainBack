/** Character limits count UTF-16 code units, matching JavaScript string.length. */
export const SOURCE_LIMITS = {
  fileBytes: 3_000_000,
  pdfPages: 30,
  textCharacters: 100_000,
  titleCharacters: 200,
  blockCharacters: 2_000,
  // Additional processing guards, independent of the uploaded compressed size.
  docxExpandedBytes: 10_000_000,
  docxEntryBytes: 5_000_000,
  docxEntries: 1_000,
  requestBytes: 3_000_000 + 65_536,
} as const;
