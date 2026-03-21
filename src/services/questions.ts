import type { FactResponse } from './api';
import type { Question } from './database';

/**
 * Extract Question[] from API FactResponse[].
 */
export function extractQuestions(facts: FactResponse[]): Question[] {
  const dbQuestions: Question[] = [];
  for (const fact of facts) {
    if (fact.questions && fact.questions.length > 0) {
      for (const question of fact.questions) {
        dbQuestions.push({
          id: question.id,
          fact_id: fact.id,
          question_type: question.question_type,
          question_text: question.question_text,
          correct_answer: question.correct_answer,
          wrong_answers: question.wrong_answers ? JSON.stringify(question.wrong_answers) : null,
          explanation: question.explanation,
          difficulty: question.difficulty,
        });
      }
    }
  }
  return dbQuestions;
}
