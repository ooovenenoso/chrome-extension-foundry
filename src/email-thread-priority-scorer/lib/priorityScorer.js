const URGENCY_TERMS = [
  'urgent', 'asap', 'today', 'eod', 'blocked', 'deadline', 'immediately', 'time sensitive',
  'approval needed', 'renewal', 'expires', 'overdue', 'critical', 'before close of business'
];

const DEAL_TERMS = [
  'contract', 'proposal', 'pricing', 'renewal', 'invoice', 'purchase order', 'po ', 'deal',
  'customer', 'client', 'salesforce', 'budget', 'terms', 'legal', 'procurement', 'security review'
];

const IMPORTANT_SENDER_TERMS = [
  'ceo', 'founder', 'vp', 'director', 'head', 'customer', 'client', 'lead', 'prospect', 'buyer'
];

const LOW_PRIORITY_TERMS = [
  'newsletter', 'unsubscribe', 'webinar', 'digest', 'community update', 'promotion', 'noreply',
  'no-reply', 'marketing', 'blog posts'
];

function countMatches(text, terms) {
  const haystack = String(text || '').toLowerCase();
  return terms.filter((term) => haystack.includes(term)).length;
}

export function extractSignalsFromText(text) {
  const raw = String(text || '').replace(/\r/g, '').trim();
  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
  const subjectLine = lines.find((line) => /^subject\s*:/i.test(line));
  const fromLine = lines.find((line) => /^(from|sender)\s*:/i.test(line));

  return {
    subject: subjectLine ? subjectLine.replace(/^subject\s*:\s*/i, '').trim() : (lines[0] || ''),
    sender: fromLine ? fromLine.replace(/^(from|sender)\s*:\s*/i, '').trim() : '',
    body: raw,
  };
}

export function scoreEmailThread({ subject = '', sender = '', body = '' } = {}) {
  const combined = `${subject}\n${sender}\n${body}`;
  const urgency = countMatches(combined, URGENCY_TERMS);
  const deal = countMatches(combined, DEAL_TERMS);
  const senderImportance = countMatches(sender, IMPORTANT_SENDER_TERMS) + countMatches(combined, ['from: ceo', 'from: founder']);
  const lowPriority = countMatches(combined, LOW_PRIORITY_TERMS);

  let score = 25;
  score += Math.min(urgency * 14, 35);
  score += Math.min(deal * 10, 30);
  score += Math.min(senderImportance * 10, 20);
  score -= Math.min(lowPriority * 16, 45);
  score = Math.max(0, Math.min(100, Math.round(score)));

  const level = score >= 75 ? 'high' : score >= 45 ? 'medium' : 'low';
  const reasons = [];
  if (urgency) reasons.push(`${urgency} urgency signal${urgency === 1 ? '' : 's'} found`);
  if (deal) reasons.push(`${deal} deal signal${deal === 1 ? '' : 's'} found`);
  if (senderImportance) reasons.push('sender appears decision-maker or customer-facing');
  if (lowPriority) reasons.push('newsletter/marketing signal lowered priority');
  if (!reasons.length) reasons.push('no strong urgency, sender, or deal signals found');

  return { score, level, reasons, signals: { urgency, deal, senderImportance, lowPriority } };
}

export function summarizePriority(result) {
  const label = result.level === 'high' ? 'High priority' : result.level === 'medium' ? 'Medium priority' : 'Low priority';
  return `${label} (${result.score}/100): ${result.reasons.slice(0, 2).join('; ')}`;
}
