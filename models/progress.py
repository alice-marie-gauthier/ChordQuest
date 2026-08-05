from __future__ import annotations

from dataclasses import dataclass, field
from typing import TypedDict


@dataclass
class ChordStats:
    attempts: int = 0
    successes: int = 0
    total_response_ms: int = 0

    @property
    def success_rate(self) -> float:
        """Fraction of attempts that were correct.

        Returns:
            0.0 if there have been no attempts yet, else successes/attempts.
        """
        if self.attempts == 0:
            return 0.0
        return self.successes / self.attempts

    @property
    def average_response_ms(self) -> int:
        """Mean time taken per attempt, in milliseconds.

        Returns:
            0 if there have been no attempts yet, else the rounded average
            of total_response_ms over attempts.
        """
        if self.attempts == 0:
            return 0
        return round(self.total_response_ms / self.attempts)


def mastery_score(stats: ChordStats) -> int:
    """Combine accuracy, speed and practice volume into one 0-100 score.

    Args:
        stats: Accumulated attempts/successes/response time for one chord
            type.

    Returns:
        0 if there have been no attempts yet. Otherwise a 0-100 score:
        75% weighted on success rate, 25% on response speed (full credit
        under 1200ms, decaying to 0 by 6000ms), scaled down by a
        "confidence" factor that ramps from 0 to 1 over the first 8
        attempts so a couple of lucky/fast tries can't max out the score.
    """
    if stats.attempts == 0:
        return 0

    speed_score = max(0.0, 1.0 - max(0, stats.average_response_ms - 1200) / 4800)
    confidence = min(1.0, stats.attempts / 8)
    return round((stats.success_rate * 0.75 + speed_score * 0.25) * confidence * 100)


class ChordStatsSummary(TypedDict):
    key: str
    attempts: int
    successes: int
    success_rate: float
    average_response_ms: int
    mastery: int


@dataclass
class ProgressStore:
    """In-memory record of practice attempts, grouped by an opaque key.

    The key is caller-defined (ChordQuest uses "category:family_id", e.g.
    "sevenths:minor7") so root-position and inversion practice on the same
    chord shape are tracked separately. The store is per-process and not
    persisted: stats reset when the server restarts, which is fine for a
    local single-player practice tool.
    """

    stats: dict[str, ChordStats] = field(default_factory=dict)

    def record_attempt(self, key: str, correct: bool, response_ms: int = 0) -> ChordStats:
        """Record one practice attempt for a chord type.

        Args:
            key: Caller-defined identifier for the chord type practiced.
            correct: Whether the attempt was correct.
            response_ms: How long the attempt took, in milliseconds; values
                <= 0 aren't counted toward the average.

        Returns:
            The updated ChordStats for this key.
        """
        entry = self.stats.setdefault(key, ChordStats())
        entry.attempts += 1
        if correct:
            entry.successes += 1
        if response_ms > 0:
            entry.total_response_ms += response_ms
        return entry

    def reset(self) -> None:
        """Discard all recorded stats for every key."""
        self.stats.clear()

    def snapshot(self) -> list[ChordStatsSummary]:
        """Build a JSON-serializable summary of every tracked chord type.

        Returns:
            One ChordStatsSummary per key, sorted by key.
        """
        return [
            {
                "key": key,
                "attempts": entry.attempts,
                "successes": entry.successes,
                "success_rate": round(entry.success_rate, 3),
                "average_response_ms": entry.average_response_ms,
                "mastery": mastery_score(entry),
            }
            for key, entry in sorted(self.stats.items())
        ]
