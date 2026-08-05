from __future__ import annotations

from dataclasses import dataclass, field
from typing import TypedDict

MAX_NAME_LENGTH = 24

# Avatars are built from small enumerated trait IDs, never free text, so
# validation is just a whitelist check — no color/markup ever comes from
# the client. The same IDs are mirrored in static/js/avatar.js, which owns
# the actual colors/shapes each ID draws; this module only needs to know
# which IDs are legal.
AVATAR_SKIN_IDS = ("s1", "s2", "s3", "s4", "s5", "s6")
AVATAR_HAIR_STYLE_IDS = ("bald", "short", "curly", "long", "mohawk")
AVATAR_HAIR_COLOR_IDS = ("c1", "c2", "c3", "c4", "c5", "c6")
AVATAR_ACCESSORY_IDS = ("none", "glasses", "headphones", "cap")
AVATAR_OUTFIT_IDS = ("o1", "o2", "o3", "o4", "o5", "o6")
AVATAR_BACKGROUND_IDS = ("b1", "b2", "b3", "b4", "b5", "b6")

DEFAULT_AVATAR = {
    "skin": "s3",
    "hairStyle": "short",
    "hairColor": "c1",
    "accessory": "none",
    "outfit": "o1",
    "background": "b1",
}


def normalize_player_key(name: str) -> str:
    """Build the canonical lookup key for a player name.

    Uses casefold() rather than lower() so it also behaves correctly for
    accented names, and strips whitespace so "Alice" and "  alice  " match.

    Args:
        name: A player's display name, in any casing/spacing.

    Returns:
        The case/accent-insensitive lookup key for that name.
    """
    return name.strip().casefold()


def is_valid_player_name(name: str) -> bool:
    """Check whether a string is acceptable as a player display name.

    Args:
        name: The candidate name.

    Returns:
        True if, after trimming whitespace, the name is non-empty, at most
        MAX_NAME_LENGTH characters, and contains no control characters
        (any other printable Unicode, including accents, is allowed).
    """
    stripped = name.strip()
    if not stripped or len(stripped) > MAX_NAME_LENGTH:
        return False
    # Reject control characters (and thus embedded newlines/tabs) but allow
    # any printable Unicode so accented names ("Émilie", "François") work.
    return all(char.isprintable() for char in stripped)


def sanitize_avatar(avatar: object) -> dict:
    """Coerce arbitrary input into a safe, complete avatar dict.

    Unknown fields are dropped and any missing/unrecognized trait value
    falls back to the matching field in DEFAULT_AVATAR, so a malformed
    payload never crashes a request or corrupts storage.

    Args:
        avatar: Untrusted input, ideally a dict with "skin", "hairStyle",
            "hairColor", "accessory", "outfit" and "background" keys, but
            may be anything (including None or a non-dict).

    Returns:
        A dict with exactly the six avatar fields, each guaranteed to be
        one of that field's allowed trait IDs.
    """
    if not isinstance(avatar, dict):
        return dict(DEFAULT_AVATAR)

    def pick(field_name: str, allowed: tuple[str, ...]) -> str:
        """Return `avatar[field_name]` if it's one of `allowed`, else the default.

        Args:
            field_name: Avatar field to read, e.g. "skin".
            allowed: The trait IDs considered valid for this field.

        Returns:
            A valid trait ID for this field.
        """
        value = avatar.get(field_name)
        return value if isinstance(value, str) and value in allowed else DEFAULT_AVATAR[field_name]

    return {
        "skin": pick("skin", AVATAR_SKIN_IDS),
        "hairStyle": pick("hairStyle", AVATAR_HAIR_STYLE_IDS),
        "hairColor": pick("hairColor", AVATAR_HAIR_COLOR_IDS),
        "accessory": pick("accessory", AVATAR_ACCESSORY_IDS),
        "outfit": pick("outfit", AVATAR_OUTFIT_IDS),
        "background": pick("background", AVATAR_BACKGROUND_IDS),
    }


@dataclass
class Player:
    name: str
    total_score: int = 0
    chords_played: int = 0
    chords_correct: int = 0
    avatar: dict = field(default_factory=lambda: dict(DEFAULT_AVATAR))

    @property
    def accuracy(self) -> float:
        """Fraction of this player's chord attempts that were correct.

        Returns:
            0.0 if they haven't attempted any chords yet, else
            chords_correct/chords_played.
        """
        if self.chords_played == 0:
            return 0.0
        return self.chords_correct / self.chords_played


class PlayerSummary(TypedDict):
    name: str
    total_score: int
    chords_played: int
    chords_correct: int
    accuracy: float
    avatar: dict


def _summarize(player: Player) -> PlayerSummary:
    """Build a JSON-serializable summary of one player.

    Args:
        player: The player to summarize.

    Returns:
        A PlayerSummary with rounded accuracy and a copy of the avatar
        dict (so callers can't mutate the stored one through it).
    """
    return {
        "name": player.name,
        "total_score": player.total_score,
        "chords_played": player.chords_played,
        "chords_correct": player.chords_correct,
        "accuracy": round(player.accuracy, 3),
        "avatar": dict(player.avatar),
    }


@dataclass
class PlayerStore:
    """Named players competing on the Chord League leaderboard.

    Kept separate from ProgressStore (per-chord-type mastery, which stays
    per-player too but is tracked by the caller) — this store only holds
    the aggregate, all-time totals that make up the ranking. Players are
    looked up case/accent-insensitively via normalize_player_key, but the
    first-used spelling is kept as the display name.
    """

    players: dict[str, Player] = field(default_factory=dict)

    def get_or_create(self, name: str, avatar: dict | None = None) -> Player:
        """Look up a player by name, creating them on first use.

        Args:
            name: The player's display name (case/accent-insensitive
                lookup; first-used spelling is kept as the display name).
            avatar: If given, sanitized and applied to the player — set on
                creation, or updated in place if the player already
                existed (so re-joining with a new avatar choice updates it
                rather than creating a duplicate).

        Returns:
            The existing or newly created Player.
        """
        key = normalize_player_key(name)
        if key not in self.players:
            self.players[key] = Player(name=name.strip(), avatar=sanitize_avatar(avatar))
        elif avatar is not None:
            # Re-joining with a new avatar choice updates the existing player
            # instead of creating a duplicate entry.
            self.players[key].avatar = sanitize_avatar(avatar)
        return self.players[key]

    def record_attempt(self, name: str, correct: bool, points: int = 0) -> Player:
        """Record one chord attempt for a player, creating them if new.

        Args:
            name: The player's display name.
            correct: Whether the attempt was correct.
            points: Score to add on a correct attempt; ignored (and never
                subtracted) on an incorrect one. Negative values are
                clamped to 0.

        Returns:
            The updated Player.
        """
        player = self.get_or_create(name)
        player.chords_played += 1
        if correct:
            player.chords_correct += 1
            player.total_score += max(0, points)
        return player

    def summary(self, name: str) -> PlayerSummary:
        """Get a JSON-serializable summary for one player, creating them if new.

        Args:
            name: The player's display name.

        Returns:
            That player's PlayerSummary.
        """
        return _summarize(self.get_or_create(name))

    def leaderboard(self) -> list[PlayerSummary]:
        """Build the full Chord League ranking.

        Returns:
            Every player's PlayerSummary, sorted by total_score descending
            (ties broken alphabetically by normalized name).
        """
        ranked = sorted(
            self.players.values(),
            key=lambda player: (-player.total_score, normalize_player_key(player.name)),
        )
        return [_summarize(player) for player in ranked]

    def to_state(self) -> dict:
        """Build a plain-dict snapshot of every player, suitable for json.dumps.

        Returns:
            A dict keyed by normalized player key, each value a plain dict
            of that player's fields (including avatar).
        """
        return {
            key: {
                "name": player.name,
                "total_score": player.total_score,
                "chords_played": player.chords_played,
                "chords_correct": player.chords_correct,
                "avatar": player.avatar,
            }
            for key, player in self.players.items()
        }

    @classmethod
    def from_state(cls, state: dict | None) -> "PlayerStore":
        """Rebuild a PlayerStore from a snapshot produced by to_state().

        Args:
            state: A dict as produced by to_state(), or None. Entries that
                aren't dicts, are missing a string "name", or have a
                non-numeric total_score/chords_played/chords_correct are
                skipped rather than raising, so a corrupted or
                hand-edited data file degrades gracefully instead of
                crashing the server on startup.

        Returns:
            A new PlayerStore containing every entry that parsed
            successfully.
        """
        store = cls()
        for key, data in (state or {}).items():
            if not isinstance(data, dict) or not isinstance(data.get("name"), str):
                continue
            try:
                store.players[key] = Player(
                    name=data["name"],
                    total_score=int(data.get("total_score", 0)),
                    chords_played=int(data.get("chords_played", 0)),
                    chords_correct=int(data.get("chords_correct", 0)),
                    avatar=sanitize_avatar(data.get("avatar")),
                )
            except (TypeError, ValueError):
                continue
        return store
