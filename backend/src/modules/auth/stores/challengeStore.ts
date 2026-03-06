import { LoginChallenge } from "../types/auth.types";

const challengeStore = new Map<string, LoginChallenge>();

export function saveChallenge(challenge: LoginChallenge): void {
  challengeStore.set(challenge.id, challenge);
}

export function getChallengeById(challengeId: string): LoginChallenge | undefined {
  return challengeStore.get(challengeId);
}

export function markChallengeUsed(challengeId: string): void {
  const challenge = challengeStore.get(challengeId);

  if (!challenge) {
    return;
  }

  challenge.used = true;
  challengeStore.set(challengeId, challenge);
}

export function deleteExpiredChallenges(): void {
  const now = Date.now();

  for (const [id, challenge] of challengeStore.entries()) {
    if (challenge.expiresAt <= now) {
      challengeStore.delete(id);
    }
  }
}