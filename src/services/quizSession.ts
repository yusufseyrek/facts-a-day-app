/**
 * Simple module-level state to pass a quick quiz session ID
 * from the home screen to the trivia tab for navigation.
 */

let _pendingSessionId: number | null = null;

export function setPendingQuizSessionId(sessionId: number): void {
  _pendingSessionId = sessionId;
}

export function consumePendingQuizSessionId(): number | null {
  const id = _pendingSessionId;
  _pendingSessionId = null;
  return id;
}
