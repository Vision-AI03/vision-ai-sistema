import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { parseBRL, formatDecimal } from "@/lib/currency";

interface CurrencyInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Text input for BRL monetary values.
 * - Accepts: "7500", "7500.50", "7.500", "7.500,00"
 * - On blur: displays formatted as "7.500,00"
 * - On focus: shows plain number for easy editing
 * - onChange emits the raw typed string; use parseBRL() to convert before saving
 */
export function CurrencyInput({ value, onChange, placeholder, className, disabled }: CurrencyInputProps) {
  const [focused, setFocused] = useState(false);
  const [display, setDisplay] = useState("");

  useEffect(() => {
    if (!focused) {
      const num = parseBRL(value);
      setDisplay(num > 0 ? formatDecimal(num) : value || "");
    }
  }, [value, focused]);

  function handleFocus() {
    setFocused(true);
    const num = parseBRL(value);
    setDisplay(num > 0 ? String(num) : value || "");
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setDisplay(raw);
    onChange(raw);
  }

  function handleBlur() {
    setFocused(false);
    const num = parseBRL(value);
    setDisplay(num > 0 ? formatDecimal(num) : value || "");
  }

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={display}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder ?? "0,00"}
      className={className}
      disabled={disabled}
    />
  );
}
