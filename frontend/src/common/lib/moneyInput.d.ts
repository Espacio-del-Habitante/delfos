export function formatMoneyInput(
  value: number | null | undefined | '',
  maxFractionDigits?: number,
): string;

export function formatMoneyTyping(raw: string, maxFractionDigits?: number): string;

export function caretAfterMoneyFormat(
  before: string,
  caret: number | null | undefined,
  after: string,
): number;

export function parseMoneyInput(raw: string): number | null;
