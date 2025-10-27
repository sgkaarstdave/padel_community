const MERGE_MARKERS = ['<<<<<<<', '=======', '>>>>>>>'];

const stripMergeMarkers = (value) => {
  if (typeof value !== 'string') {
    return value;
  }
  if (!MERGE_MARKERS.some((marker) => value.includes(marker))) {
    return value;
  }
  const cleanedLines = value
    .split(/\r?\n/)
    .filter((line) => !MERGE_MARKERS.some((marker) => line.includes(marker)));
  return cleanedLines.join('\n');
};

const sanitizeText = (value) => {
  if (typeof value !== 'string') {
    return value;
  }
  const cleaned = stripMergeMarkers(value);
  return cleaned.trim();
};

export { stripMergeMarkers, sanitizeText };
