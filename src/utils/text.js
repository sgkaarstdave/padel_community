const MERGE_MARKERS = [
  '<<<<<<<',
  '=======',
  '>>>>>>>',
  '|||||||',
  '<<<<<<',
  '>>>>>>',
];

const stripMergeMarkers = (value) => {
  if (typeof value !== 'string') {
    return value;
  }
  if (!MERGE_MARKERS.some((marker) => value.includes(marker))) {
    return value;
  }

  const cleanedLines = value
    .split(/\r?\n/)
    .filter((line) => {
      const normalized = line.trim();
      return !MERGE_MARKERS.some((marker) => normalized.includes(marker));
    });

  return cleanedLines.join('\n');
};

const collapseWhitespace = (value) =>
  value
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n');

const sanitizeText = (value) => {
  if (value == null) {
    return '';
  }

  if (typeof value !== 'string') {
    return sanitizeText(String(value));
  }

  const cleaned = stripMergeMarkers(value);
  const collapsed = collapseWhitespace(cleaned);
  const trimmed = collapsed.trim();

  if (trimmed === '[object Object]') {
    return '';
  }

  return trimmed;
};

export { stripMergeMarkers, sanitizeText };
