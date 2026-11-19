import { useState } from "react";

interface McqQuestion {
  question: string;
  options: string[];
  correct_index: number;
}

interface McqQuizProps {
  questions: McqQuestion[];
}

export function McqQuiz({ questions }: McqQuizProps) {
  const [answers, setAnswers] = useState<(number | null)[]>(
    questions.map(() => null)
  );
  const [submitted, setSubmitted] = useState(false);

  const score = submitted
    ? answers.filter((a, i) => a === questions[i].correct_index).length
    : 0;

  const handleSelect = (qIdx: number, oIdx: number) => {
    if (submitted) return;
    setAnswers((prev) => prev.map((v, i) => (i === qIdx ? oIdx : v)));
  };

  const allAnswered = answers.every((a) => a !== null);

  const getOptionStyle = (qIdx: number, oIdx: number) => {
    if (!submitted) {
      return answers[qIdx] === oIdx
        ? "border-white bg-white/10 text-white"
        : "border-n-border text-n-text2 hover:border-n-border2 hover:bg-white/[0.02]";
    }
    if (oIdx === questions[qIdx].correct_index) {
      return "border-white bg-white/10 text-white";
    }
    if (answers[qIdx] === oIdx) {
      return "border-n-border text-n-text3 opacity-40 line-through";
    }
    return "border-n-border text-n-text3 opacity-30";
  };

  return (
    <div className="space-y-4 animate-fade-in font-mono">
      {questions.map((q, qIdx) => (
        <div key={qIdx} className="bg-n-surface border border-n-border rounded-sm p-4 space-y-3">
          <p className="text-white font-medium text-xs leading-snug">
            <span className="text-white font-bold mr-1.5">{qIdx + 1}.</span>
            {q.question}
          </p>
          <div className="space-y-2">
            {q.options.map((opt, oIdx) => {
              const isCorrect = submitted && oIdx === questions[qIdx].correct_index;
              const isWrong = submitted && answers[qIdx] === oIdx && oIdx !== questions[qIdx].correct_index;

              return (
                <button
                  key={oIdx}
                  type="button"
                  onClick={() => handleSelect(qIdx, oIdx)}
                  disabled={submitted}
                  className={`
                    w-full text-left px-3.5 py-2.5 rounded-sm border text-xs flex items-center justify-between
                    transition-all duration-150 active:scale-[0.99]
                    ${getOptionStyle(qIdx, oIdx)}
                  `}
                >
                  <div className="flex items-center">
                    <span className="font-semibold mr-2 text-[10px] opacity-70">
                      {String.fromCharCode(65 + oIdx)}.
                    </span>
                    <span>{opt}</span>
                  </div>
                  {isCorrect && <span className="font-mono text-xs ml-2 text-white">✓</span>}
                  {isWrong && <span className="font-mono text-xs ml-2 text-n-text3">✕</span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Submit / Score */}
      {!submitted ? (
        <button
          type="button"
          onClick={() => setSubmitted(true)}
          disabled={!allAnswered}
          className="btn-primary disabled:opacity-30 rounded-sm"
        >
          Submit Answers
        </button>
      ) : (
        <div className="bg-n-surface border border-n-border rounded-sm p-4 flex items-center justify-between animate-slide-up">
          <div>
            <p className="text-white font-bold text-xs uppercase tracking-wider">
              Score: {score}/{questions.length}
            </p>
            <p className="text-n-text3 text-[10px] mt-0.5 uppercase tracking-wider">
              {score === questions.length
                ? "Perfect"
                : score >= questions.length / 2
                ? "Passed"
                : "Try again"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setAnswers(questions.map(() => null));
              setSubmitted(false);
            }}
            className="btn-ghost text-xs rounded-sm py-2 px-3"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
