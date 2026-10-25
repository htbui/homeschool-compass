import { useState } from 'react';
import { View, type TextInputProps } from 'react-native';

import { formatClock, formatDate } from '@/lib/dates';
import { parseDate, parseMoney, parseTime } from '@/lib/parse';
import type { ClockTime, DateKey } from '@/lib/types';

import { Field, T } from './index';
import { useColors } from './theme';

type Base = Omit<TextInputProps, 'value' | 'onChangeText' | 'onChange'> & { label?: string };

interface ParsedFieldProps<V> extends Base {
  value: V | undefined;
  onChange: (v: V | undefined) => void;
  parse: (text: string) => V | undefined;
  format: (v: V) => string;
  /** Shown under a valid value, e.g. "Sun, May 21, 2017 · age 9". */
  describe?: (v: V) => string;
  /** Extra rule for a parsed value; return an error message to reject it. */
  validate?: (v: V) => string | undefined;
  example: string;
  required?: boolean;
}

/**
 * Text field that accepts forgiving input, shows live feedback, and only
 * reports a value to the form once it parses (and passes `validate`).
 */
export function ParsedField<V>({ value, onChange, parse, format, describe, validate, example, required, label, ...rest }: ParsedFieldProps<V>) {
  const c = useColors();
  const [text, setText] = useState(value === undefined ? '' : format(value));
  const parsed = text.trim() ? parse(text) : undefined;
  const error = parsed !== undefined ? validate?.(parsed) : undefined;

  let feedback: { text: string; color: string } | undefined;
  if (!text.trim()) feedback = required ? { text: `Required — e.g. ${example}`, color: c.textMuted } : { text: `e.g. ${example}`, color: c.textMuted };
  else if (parsed === undefined) feedback = { text: `Not recognized — try ${example}`, color: c.danger };
  else if (error) feedback = { text: error, color: c.danger };
  else feedback = { text: `✓ ${describe ? describe(parsed) : format(parsed)}`, color: c.success };

  return (
    <View style={{ gap: 4 }}>
      <Field
        label={label}
        placeholder={example}
        {...rest}
        value={text}
        onChangeText={(t) => {
          setText(t);
          const p = t.trim() ? parse(t) : undefined;
          onChange(p !== undefined && !validate?.(p) ? p : undefined);
        }}
        onBlur={(e) => {
          // Tidy valid input into the canonical display form.
          if (parsed !== undefined && !error) setText(format(parsed));
          rest.onBlur?.(e);
        }}
      />
      <T v="caption" color={feedback.color} accessibilityLiveRegion="polite">{feedback.text}</T>
    </View>
  );
}

const usDate = (d: DateKey) => {
  const [y, m, day] = d.split('-');
  return `${m}/${day}/${y}`;
};

export function DateField(props: Omit<ParsedFieldProps<DateKey>, 'parse' | 'format' | 'example'> & { example?: string }) {
  return (
    <ParsedField<DateKey>
      example="05/21/2017"
      keyboardType="numbers-and-punctuation"
      autoComplete="off"
      describe={(d) => formatDate(d, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
      {...props}
      parse={parseDate}
      format={usDate}
    />
  );
}

export function TimeField(props: Omit<ParsedFieldProps<ClockTime>, 'parse' | 'format' | 'example'> & { example?: string }) {
  return <ParsedField<ClockTime> example="9:30 AM" autoComplete="off" {...props} parse={parseTime} format={formatClock} />;
}

export function MoneyField(props: Omit<ParsedFieldProps<number>, 'parse' | 'format' | 'example'> & { example?: string }) {
  return (
    <ParsedField<number>
      example="49.99"
      keyboardType="decimal-pad"
      describe={(n) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
      {...props}
      parse={parseMoney}
      format={(n) => (Number.isInteger(n) ? String(n) : n.toFixed(2))}
    />
  );
}
