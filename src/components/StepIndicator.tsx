import { Check } from "lucide-react";
import type { Step } from "@/types/lesson";
export function StepIndicator({ step }: { step: Step }) {
 return <ol className="steps" aria-label="Session progress">{["Learning source", "Your explanation", "Understanding map"].map((label, i) => <li key={label} className={step === i + 1 ? "active" : step > i + 1 ? "complete" : ""} aria-current={step === i + 1 ? "step" : undefined}><span className="step-number">{step > i + 1 ? <Check size={15} /> : `0${i + 1}`}</span><span>{label}</span></li>)}</ol>;
}
