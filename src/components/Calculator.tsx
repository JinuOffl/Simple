// ── Calculator — Nothing OS monochrome keypad ─────────────────────────────────
import { useState, useCallback } from "react";

type CalcButton =
  | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
  | "." | "+" | "-" | "×" | "÷" | "=" | "C" | "⌫" | "+/-" | "%";

const BUTTONS: CalcButton[][] = [
  ["C", "+/-", "%", "÷"],
  ["7", "8",   "9", "×"],
  ["4", "5",   "6", "-"],
  ["1", "2",   "3", "+"],
  ["0", ".",   "⌫", "="],
];

interface CalcState {
  display: string;
  prev: number | null;
  op: "+" | "-" | "×" | "÷" | null;
  waitingForOperand: boolean;
}

const INITIAL: CalcState = { display: "0", prev: null, op: null, waitingForOperand: false };

function safeCalc(a: number, op: "+" | "-" | "×" | "÷", b: number): number | "Error" {
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "×": return a * b;
    case "÷": return b === 0 ? "Error" : a / b;
  }
}

function fmt(n: number | "Error"): string {
  if (n === "Error") return "Error";
  return String(parseFloat(n.toPrecision(12)));
}

export function Calculator() {
  const [state, setState] = useState<CalcState>(INITIAL);

  const press = useCallback((btn: CalcButton) => {
    setState(prev => {
      const { display, op, waitingForOperand } = prev;
      let { prev: stored } = prev;

      if (btn === "C") return INITIAL;

      if (btn === "⌫") {
        if (display === "Error") return INITIAL;
        return { ...prev, display: display.length > 1 ? display.slice(0, -1) : "0" };
      }

      if (btn === "+/-") {
        if (display === "0" || display === "Error") return prev;
        return { ...prev, display: display.startsWith("-") ? display.slice(1) : "-" + display };
      }

      if (btn === "%") {
        return { ...prev, display: fmt(parseFloat(display) / 100), waitingForOperand: false };
      }

      if (/^[0-9.]$/.test(btn)) {
        if (display === "Error") return { ...INITIAL, display: btn === "." ? "0." : btn };
        if (btn === "." && display.includes(".")) return prev;
        const next = waitingForOperand
          ? btn === "." ? "0." : btn
          : display === "0" && btn !== "." ? btn : display + btn;
        return { ...prev, display: next, waitingForOperand: false };
      }

      if (btn === "+" || btn === "-" || btn === "×" || btn === "÷") {
        if (display === "Error") return INITIAL;
        const cur = parseFloat(display);
        if (stored !== null && op && !waitingForOperand) {
          const r = safeCalc(stored, op, cur);
          if (r === "Error") return { display: "Error", prev: null, op: null, waitingForOperand: false };
          stored = r;
          return { display: fmt(r), prev: stored, op: btn, waitingForOperand: true };
        }
        return { display, prev: cur, op: btn, waitingForOperand: true };
      }

      if (btn === "=") {
        if (stored === null || !op || display === "Error") return prev;
        const r = safeCalc(stored, op, parseFloat(display));
        if (r === "Error") return { display: "Error", prev: null, op: null, waitingForOperand: false };
        return { display: fmt(r), prev: null, op: null, waitingForOperand: true };
      }

      return prev;
    });
  }, []);

  const isOp = (b: CalcButton) => ["÷", "×", "-", "+"].includes(b);
  const isEq = (b: CalcButton) => b === "=";
  const isFn = (b: CalcButton) => ["C", "+/-", "%"].includes(b);

  return (
    <div className="bg-n-s1 border border-n-line rounded-sm overflow-hidden animate-fade-in select-none">
      {/* Display */}
      <div className="px-4 pt-5 pb-4 text-right">
        <p className="text-n-disabled text-[10px] uppercase tracking-wider h-4 mb-2">
          {state.prev !== null && state.op ? `${state.prev} ${state.op}` : ""}
        </p>
        {/* Doto font for the number display */}
        <p
          className="font-doto text-n-display leading-none"
          style={{
            fontSize: state.display.length > 10 ? "28px" : state.display.length > 7 ? "36px" : "48px",
            fontVariationSettings: "'ROND' 0",
            color: state.display === "Error" ? "var(--n-red)" : undefined,
          }}
        >
          {state.display}
        </p>
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-4 border-t border-n-line">
        {BUTTONS.flat().map((btn, i) => (
          <button
            key={i}
            onClick={() => press(btn)}
            className={`
              h-14 text-sm font-mono transition-all duration-75
              border-r border-b border-n-line last:border-r-0
              active:scale-95 nt-press cursor-pointer
              ${isEq(btn)
                ? "bg-n-btn text-n-btn-text font-bold hover:opacity-90"
                : isOp(btn)
                  ? "bg-n-s2 text-n-primary hover:bg-n-s3 hover:text-n-display"
                  : isFn(btn)
                    ? "bg-n-s2 text-n-secondary hover:bg-n-s3 hover:text-n-display"
                    : "bg-n-s1 text-n-primary hover:bg-n-s2 hover:text-n-display"
              }
            `}
          >
            {btn}
          </button>
        ))}
      </div>
    </div>
  );
}
