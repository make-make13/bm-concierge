export type TelegramReplyExtra = {
  parse_mode: 'HTML';
  disable_web_page_preview?: boolean;
};

export type TelegramFormattedReply = {
  text: string;
  extra?: TelegramReplyExtra;
};

const STRUCTURED_MIN_LENGTH = 120;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getMeaningfulLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isBulletLine(line: string): boolean {
  return /^([-*•]|\d+[.)])\s+/.test(line.trim());
}

function isShortHeading(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.endsWith(':') && trimmed.length <= 70 && !isBulletLine(trimmed);
}

function shouldFormatTelegramReply(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const lines = getMeaningfulLines(trimmed);
  const bulletCount = lines.filter(isBulletLine).length;
  const hasHeading = lines.some(isShortHeading);
  const hasParagraphBreak = /\n\s*\n/.test(trimmed);
  const hasSeveralLines = lines.length >= 3;

  if (bulletCount > 0 || hasHeading) return true;
  if (trimmed.length < STRUCTURED_MIN_LENGTH) return false;

  return hasParagraphBreak || hasSeveralLines;
}

function formatLine(line: string): string {
  const trimmed = line.trim();

  if (isShortHeading(trimmed)) {
    return `<b>${escapeHtml(trimmed.slice(0, -1))}</b>:`;
  }

  const bulletMatch = trimmed.match(/^([-*•]|\d+[.)])\s+(.+)$/);
  if (bulletMatch) {
    return `• ${escapeHtml(bulletMatch[2])}`;
  }

  return escapeHtml(trimmed);
}

export function formatTelegramReply(text: string): TelegramFormattedReply {
  const trimmed = text.trim();
  if (!shouldFormatTelegramReply(trimmed)) {
    return { text: trimmed };
  }

  const formatted = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim() ? formatLine(line) : '')
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

  return {
    text: formatted,
    extra: {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    },
  };
}
