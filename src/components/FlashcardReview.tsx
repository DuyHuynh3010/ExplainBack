"use client";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import type { EvaluationResult, SourceAnalysis } from "@/backend/contracts/domain";
import { buildReviewCards } from "@/lib/review-cards";
import { StatusBadge } from "./StatusBadge";

interface Props {
  analysis: SourceAnalysis;
  evaluation: EvaluationResult;
  onBack: () => void;
  onExplainAgain: () => void;
}

export function FlashcardReview({ analysis, evaluation, onBack, onExplainAgain }: Props) {
  const cards = useMemo(() => buildReviewCards(analysis, evaluation), [analysis, evaluation]);
  const [active, setActive] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState<Set<string>>(() => new Set());

  function goTo(index: number) {
    if (!cards.length) return;
    setActive((index + cards.length) % cards.length);
    setFlipped(false);
  }
  function reveal() {
    const card = cards[active];
    setFlipped(value => !value);
    if (card) setReviewed(current => new Set(current).add(card.id));
  }

  return <section className="review-workspace" aria-labelledby="review-heading" onKeyDown={event => {
    if (event.key === "ArrowLeft") goTo(active - 1);
    if (event.key === "ArrowRight") goTo(active + 1);
  }}>
    <div className="view-heading review-heading"><span className="eyebrow">STEP 04 · REVIEW</span><h1 id="review-heading">Review what needs another pass.</h1><p>Flip each card to compare your explanation with the learning source.</p></div>
    {!cards.length ? <div className="card review-empty"><CheckCircle2 size={28} /><h2>No review cards needed</h2><p>Every source relationship was marked correct in this attempt.</p></div> : <>
      <div className="review-toolbar"><div><strong>{reviewed.size} of {cards.length} reviewed</strong><span>{active + 1} / {cards.length}</span></div><div className="review-progress" aria-label={`${reviewed.size} of ${cards.length} cards reviewed`}><span style={{ width: `${reviewed.size / cards.length * 100}%` }} /></div></div>
      <div className="review-stage" aria-live="polite">
        {cards.map((card, index) => {
          const offset = index - active;
          const position = offset === 0 ? "active" : offset === -1 || (active === 0 && index === cards.length - 1) ? "previous" : offset === 1 || (active === cards.length - 1 && index === 0) ? "next" : "hidden";
          return <article className={`review-card-shell ${position}`} key={card.id} aria-hidden={position !== "active"}>
            <button className={`review-flashcard ${flipped && position === "active" ? "flipped" : ""}`} onClick={reveal} tabIndex={position === "active" ? 0 : -1} aria-label={flipped && position === "active" ? "Show review prompt" : "Reveal review answer"}>
              <span className="review-card-inner">
                <span className="review-card-face review-card-front"><span className="review-card-meta"><span>{card.topic}</span><StatusBadge status={card.status} /></span><span className="review-cue">{card.cue}</span><strong>{card.prompt}</strong><span className="review-flip-hint">Click to reveal</span></span>
                <span className="review-card-face review-card-back"><span className="review-card-meta"><span>{card.topic}</span><StatusBadge status={card.status} /></span><span className="review-answer-section"><small>LEARNING SOURCE</small><strong>{card.sourceAssertion}</strong></span><span className="review-answer-section"><small>YOUR EXPLANATION</small>{card.learnerAssertions.length ? card.learnerAssertions.map((statement, learnerIndex) => <span key={`${learnerIndex}:${statement}`}>{statement}</span>) : <span>Not mentioned in this attempt.</span>}</span><span className="review-answer-section"><small>WHY THIS NEEDS REVIEW</small><span>{card.explanation}</span></span>{!!card.suggestions.length && <span className="review-answer-section"><small>TRY NEXT</small><span>{card.suggestions[0]}</span></span>}<span className="review-flip-hint">Click to see the prompt</span></span>
              </span>
            </button>
          </article>;
        })}
      </div>
      <div className="review-controls"><button className="button secondary review-arrow" onClick={() => goTo(active - 1)} aria-label="Previous flashcard"><ChevronLeft size={18} /></button><div className="review-dots" aria-label="Choose a flashcard">{cards.map((card, index) => <button key={card.id} className={index === active ? "active" : ""} onClick={() => goTo(index)} aria-label={`Flashcard ${index + 1}`} aria-current={index === active ? "true" : undefined} />)}</div><button className="button secondary review-arrow" onClick={() => goTo(active + 1)} aria-label="Next flashcard"><ChevronRight size={18} /></button></div>
      {reviewed.size === cards.length && <p className="review-complete"><CheckCircle2 size={16} />All cards reviewed. Try explaining the lesson again.</p>}
    </>}
    <div className="card-bottom"><button className="button ghost" onClick={onBack}><ArrowLeft size={16} />Back to feedback</button><div className="inline-actions">{!!cards.length && <button className="button secondary" onClick={() => { setReviewed(new Set()); goTo(0); }}><RotateCcw size={15} />Review again</button>}<button className="button primary" onClick={onExplainAgain}>Explain again<ArrowRight size={17} /></button></div></div>
  </section>;
}
