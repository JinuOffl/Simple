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
        ? "border-primary-400 bg-primary-500/20 text-white"
        : "border-white/10 text-white/70 hover:border-white/30 hover:bg-white/5";
    }
    if (oIdx === questions[qIdx].correct_index) {
      return "border-green-400 bg-green-500/20 text-green-300";
    }
    if (answers[qIdx] === oIdx) {
      return "border-red-400 bg-red-500/20 text-red-300";
    }
    return "border-white/10 text-white/30";
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {questions.map((q, qIdx) => (
        <div key={qIdx} className="glass rounded-2xl p-4 space-y-3">
          <p className="text-white font-medium text-sm leading-snug">
            <span className="text-primary-400 font-bold mr-1.5">{qIdx + 1}.</span>
            {q.question}
          </p>
          <div className="space-y-2">
            {q.options.map((opt, oIdx) => (
              <button
                key={oIdx}
                onClick={() => handleSelect(qIdx, oIdx)}
                disabled={submitted}
                className={`
                  w-full text-left px-4 py-2.5 rounded-xl border text-sm
                  transition-all duration-200 active:scale-[0.98]
                  ${getOptionStyle(qIdx, oIdx)}
                `}
              >
                <span className="font-semibold mr-2 text-xs opacity-70">
                  {String.fromCharCode(65 + oIdx)}.
                </span>
                {opt}
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Submit / Score */}
      {!submitted ? (
        <button
          onClick={() => setSubmitted(true)}
          disabled={!allAnswered}
          className="btn-primary disabled:opacity-40"
        >
          Submit Answers
        </button>
      ) : (
        <div className="glass rounded-2xl p-4 flex items-center justify-between animate-slide-up">
          <div>
            <p className="text-white font-semibold">
              Score: {score}/{questions.length}
            </p>
            <p className="text-white/50 text-xs mt-0.5">
              {score === questions.length
                ? "Perfect! 🎉"
                : score >= questions.length / 2
                ? "Good effort! 👍"
                : "Keep practicing! 💪"}
            </p>
          </div>
          <button
            onClick={() => {
              setAnswers(questions.map(() => null));
              setSubmitted(false);
            }}
            className="btn-ghost text-sm"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
