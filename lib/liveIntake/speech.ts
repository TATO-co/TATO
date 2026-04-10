function normalizeAgentSpeech(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeActionText(text: string) {
  return normalizeAgentSpeech(text)
    .split(' ')
    .filter((token) => token.length >= 4)
    .filter((token) => !['that', 'this', 'with', 'from', 'have', 'show', 'need', 'more', 'view'].includes(token));
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

const VISUAL_ACTION_REQUEST_PATTERNS = [
  /\bshow\b/,
  /\bflip\b/,
  /\bturn\b/,
  /\brotate\b/,
  /\btilt\b/,
  /\blift\b/,
  /\bhold\b/,
  /\bmove\b/,
  /\bbring\b.*\bcloser\b/,
  /\bget\b.*\bcloser\b/,
  /\bpan\b/,
  /\bscan\b/,
  /\blook at\b/,
];

const VISUAL_TARGET_PATTERNS = [
  /\blabel\b/,
  /\bsticker\b/,
  /\bserial\b/,
  /\bmodel\b/,
  /\bback\b/,
  /\bfront\b/,
  /\bside\b/,
  /\bunderside\b/,
  /\bport\b/,
  /\bconnector\b/,
  /\bcharger\b/,
  /\bcorner\b/,
  /\bedge\b/,
  /\btag\b/,
  /\blogo\b/,
  /\bhinge\b/,
  /\bscreen\b/,
  /\bdisplay\b/,
  /\bcamera\b/,
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

export function looksLikeLiveVisualActionRequest(text: string) {
  const normalized = normalizeAgentSpeech(text);
  if (!normalized) {
    return false;
  }

  return (
    VISUAL_ACTION_REQUEST_PATTERNS.some((pattern) => pattern.test(normalized))
    && VISUAL_TARGET_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}

export function referencesLiveNextBestAction(agentText: string, nextBestAction: string) {
  const normalizedSpeech = normalizeAgentSpeech(agentText);
  if (!normalizedSpeech) {
    return false;
  }

  const normalizedAction = normalizeAgentSpeech(nextBestAction);
  if (!normalizedAction) {
    return false;
  }

  if (normalizedSpeech.includes(normalizedAction)) {
    return true;
  }

  const actionTokens = tokenizeActionText(nextBestAction);
  if (actionTokens.length === 0) {
    return false;
  }

  const matches = actionTokens.filter((token) => normalizedSpeech.includes(token));
  return matches.length >= Math.min(2, actionTokens.length);
}
