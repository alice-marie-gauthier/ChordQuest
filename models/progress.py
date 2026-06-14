from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ChordStats:
    attempts: int = 0
    successes: int = 0
    total_response_ms: int = 0

    @property
    def success_rate(self) -> float:
        if self.attempts == 0:
            return 0.0
        return self.successes / self.attempts

    @property
    def average_response_ms(self) -> int:
        if self.attempts == 0:
            return 0
        return round(self.total_response_ms / self.attempts)


def mastery_score(stats: ChordStats) -> int:
    if stats.attempts == 0:
        return 0

    speed_score = max(0.0, 1.0 - max(0, stats.average_response_ms - 1200) / 4800)
    confidence = min(1.0, stats.attempts / 8)
    return round((stats.success_rate * 0.75 + speed_score * 0.25) * confidence * 100)
