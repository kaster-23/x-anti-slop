/** Removes provider key material from text that might be logged or stored. */
export function redactSecrets(text: string): string {
  return text.replace(/\b(?:apikey_|sk-or-)[^\s"'\\]+/gi, '[redacted]');
}
