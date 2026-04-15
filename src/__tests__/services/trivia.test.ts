import type { Question } from '../../services/database';
import { answerToIndex, isAnswerCorrect, isTextAnswerCorrect } from '../../services/trivia';

function tf(correct_answer: string): Question {
  return {
    id: 1,
    fact_id: 1,
    question_type: 'true_false',
    question_text: 'q',
    correct_answer,
    wrong_answers: null,
    explanation: null,
    difficulty: 1,
  };
}

describe('true/false correctness', () => {
  describe('isAnswerCorrect', () => {
    it('English: true is correct for correct_answer="true"', () => {
      expect(isAnswerCorrect(tf('true'), 0)).toBe(true);
      expect(isAnswerCorrect(tf('true'), 1)).toBe(false);
    });

    it('English: false is correct for correct_answer="false"', () => {
      expect(isAnswerCorrect(tf('false'), 1)).toBe(true);
      expect(isAnswerCorrect(tf('false'), 0)).toBe(false);
    });

    it.each([
      ['Turkish', 'Doğru', 'Yanlış'],
      ['German', 'Wahr', 'Falsch'],
      ['French', 'Vrai', 'Faux'],
      ['Spanish', 'Verdadero', 'Falso'],
      ['Japanese', '正しい', '間違い'],
      ['Korean', '참', '거짓'],
      ['Chinese', '对', '错'],
    ])(
      '%s: user picking the matching option is marked correct (legacy localized data)',
      (_lang, trueWord, falseWord) => {
        // correct answer is "true"
        expect(isAnswerCorrect(tf(trueWord), 0)).toBe(true);
        expect(isAnswerCorrect(tf(trueWord), 1)).toBe(false);
        // correct answer is "false"
        expect(isAnswerCorrect(tf(falseWord), 1)).toBe(true);
        expect(isAnswerCorrect(tf(falseWord), 0)).toBe(false);
      }
    );

    it('handles surrounding whitespace and mixed case', () => {
      expect(isAnswerCorrect(tf('  TRUE  '), 0)).toBe(true);
      expect(isAnswerCorrect(tf(' doĞru'), 0)).toBe(true);
    });
  });

  describe('answerToIndex + isTextAnswerCorrect round trip', () => {
    it('user selecting "True" matches correct_answer="true" across languages', () => {
      const correctTrueSamples = ['true', 'Doğru', 'Wahr', 'Vrai', '正しい', '참', '对'];
      for (const correct of correctTrueSamples) {
        expect(answerToIndex(tf(correct), 'True')).toBe(0);
        expect(isTextAnswerCorrect(tf(correct), 'True')).toBe(true);
        expect(isTextAnswerCorrect(tf(correct), 'False')).toBe(false);
      }
    });

    it('user selecting "False" matches correct_answer="false" across languages', () => {
      const correctFalseSamples = ['false', 'Yanlış', 'Falsch', 'Faux', '間違い', '거짓', '错'];
      for (const correct of correctFalseSamples) {
        expect(answerToIndex(tf(correct), 'False')).toBe(1);
        expect(isTextAnswerCorrect(tf(correct), 'False')).toBe(true);
        expect(isTextAnswerCorrect(tf(correct), 'True')).toBe(false);
      }
    });
  });
});
