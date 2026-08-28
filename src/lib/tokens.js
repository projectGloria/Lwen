/**
 * Token estimation. Ollama exposes no tokenizer endpoint, so Lwen approximates
 * with a deliberately slightly-pessimistic heuristic: over-estimating costs a
 * little unused context, under-estimating silently truncates the conversation.
 */
export function estimateTokens(text) {
  if (!text) return 0
  const words = text.split(/\s+/).filter(Boolean).length
  const symbols = (text.match(/[^\w\s]/g) || []).length
  return Math.ceil(words * 1.3 + symbols * 0.5 + text.length * 0.05)
}

export function estimateMessageTokens(message) {
  // Roughly four tokens of role/turn framing per message.
  return estimateTokens(message.content || '') + 4
}

export function estimateConversationTokens(messages) {
  return messages.reduce((sum, m) => sum + estimateMessageTokens(m), 0)
}

export function formatTokens(n) {
  if (n < 1000) return String(n)
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`
  return `${Math.round(n / 1000)}k`
}
