function normalizeAgentSpeech(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NEGATED_READY_PATTERNS = [
  /\bnot ready\b/,
  /\bisn't ready\b/,
  /\bnot complete\b/,
  /\bstill missing\b/,
  /\bstill need\b/,
  /\bneed(s)? one more\b/,
  /\bneed(s)? another\b/,
  /\bwaiting for\b/,
  /\bbefore (?:the )?draft is ready\b/,
  /\bonce (?:the )?draft is ready\b/,
  /\bwhen (?:the )?draft is ready\b/,
];

const READY_CLAIM_PATTERNS = [
  /\bdraft(?: is|'s)? ready\b/,
  /\bdraft(?: is|'s)? complete\b/,
  /\bdraft(?: is|'s)? done\b/,
  /\byou(?:'re| are) ready to post\b/,
  /\byou can post\b/,
  /\bgood to post\b/,
  /\ball set to post\b/,
  /\bready for (?:the )?broker queue\b/,
  /\bpost actions?\b.*\b(?:appear|show|showing|available|visible)\b/,
  /\bbuttons?\b.*\b(?:appear|show|showing|available|visible)\b/,
];

export function looksLikeLiveDraftReadyClaim(text: string) {
  const normalized = normalizeAgentSpeech(text);
  if (!normalized) {
    return false;
  }

  if (NEGATED_READY_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  return READY_CLAIM_PATTERNS.some((pattern) => pattern.test(normalized));
}
