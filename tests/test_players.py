import unittest

from models.players import DEFAULT_AVATAR, PlayerStore, is_valid_player_name, normalize_player_key, sanitize_avatar


class PlayerNameValidationTests(unittest.TestCase):
    def test_rejects_empty_or_whitespace_only_names(self):
        self.assertFalse(is_valid_player_name(""))
        self.assertFalse(is_valid_player_name("   "))

    def test_rejects_names_over_the_length_limit(self):
        self.assertFalse(is_valid_player_name("x" * 25))
        self.assertTrue(is_valid_player_name("x" * 24))

    def test_rejects_control_characters(self):
        self.assertFalse(is_valid_player_name("Alice\nBot"))
        self.assertFalse(is_valid_player_name("Alice\tBot"))

    def test_accepts_accented_and_punctuated_names(self):
        self.assertTrue(is_valid_player_name("Émilie"))
        self.assertTrue(is_valid_player_name("Jean-Luc"))
        self.assertTrue(is_valid_player_name("O'Brien"))

    def test_normalize_key_is_case_and_accent_fold_insensitive_for_case(self):
        self.assertEqual(normalize_player_key("Alice"), normalize_player_key("  alice  "))
        self.assertNotEqual(normalize_player_key("Alice"), normalize_player_key("Bob"))


class PlayerStoreTests(unittest.TestCase):
    def test_get_or_create_reuses_the_same_player_case_insensitively(self):
        store = PlayerStore()
        first = store.get_or_create("Alice")
        second = store.get_or_create("alice")

        self.assertIs(first, second)
        self.assertEqual(first.name, "Alice")

    def test_record_attempt_only_scores_points_on_correct_answers(self):
        store = PlayerStore()
        store.record_attempt("Alice", True, 280)
        store.record_attempt("Alice", False, 999)

        player = store.get_or_create("Alice")
        self.assertEqual(player.chords_played, 2)
        self.assertEqual(player.chords_correct, 1)
        self.assertEqual(player.total_score, 280)

    def test_leaderboard_is_ranked_by_total_score_descending(self):
        store = PlayerStore()
        store.record_attempt("Alice", True, 100)
        store.record_attempt("Bob", True, 300)
        store.record_attempt("Cleo", True, 200)

        names = [entry["name"] for entry in store.leaderboard()]
        self.assertEqual(names, ["Bob", "Cleo", "Alice"])

    def test_summary_reports_rounded_accuracy(self):
        store = PlayerStore()
        store.record_attempt("Alice", True, 100)
        store.record_attempt("Alice", True, 100)
        store.record_attempt("Alice", False, 0)

        summary = store.summary("Alice")
        self.assertEqual(summary["chords_played"], 3)
        self.assertAlmostEqual(summary["accuracy"], 0.667, places=3)

    def test_round_trips_through_state(self):
        store = PlayerStore()
        store.record_attempt("Alice", True, 150)

        restored = PlayerStore.from_state(store.to_state())

        self.assertEqual(restored.leaderboard(), store.leaderboard())

    def test_from_state_ignores_malformed_entries(self):
        restored = PlayerStore.from_state({
            "bad": {"total_score": "not-a-number"},
            "missing-name": {"total_score": 5},
            "ok": {"name": "Cleo", "total_score": 10, "chords_played": 2, "chords_correct": 1},
        })

        self.assertEqual([entry["name"] for entry in restored.leaderboard()], ["Cleo"])

    def test_new_player_defaults_to_the_default_avatar(self):
        store = PlayerStore()
        player = store.get_or_create("Alice")

        self.assertEqual(player.avatar, DEFAULT_AVATAR)

    def test_get_or_create_applies_a_valid_avatar_on_first_join(self):
        store = PlayerStore()
        avatar = {
            "skin": "s5",
            "hairStyle": "curly",
            "hairColor": "c4",
            "accessory": "glasses",
            "outfit": "o3",
            "background": "b6",
        }

        player = store.get_or_create("Alice", avatar=avatar)

        self.assertEqual(player.avatar, avatar)

    def test_rejoining_updates_the_avatar_without_creating_a_new_player(self):
        store = PlayerStore()
        store.record_attempt("Alice", True, 100)

        store.get_or_create("alice", avatar={"skin": "s2", "hairStyle": "mohawk"})

        player = store.get_or_create("Alice")
        self.assertEqual(player.total_score, 100)
        self.assertEqual(player.avatar["skin"], "s2")
        self.assertEqual(player.avatar["hairStyle"], "mohawk")
        # Unset fields fall back to the default rather than a prior avatar.
        self.assertEqual(player.avatar["accessory"], DEFAULT_AVATAR["accessory"])

    def test_avatar_survives_a_state_round_trip(self):
        store = PlayerStore()
        store.get_or_create("Alice", avatar={"skin": "s6", "accessory": "cap"})

        restored = PlayerStore.from_state(store.to_state())

        self.assertEqual(restored.get_or_create("Alice").avatar["skin"], "s6")
        self.assertEqual(restored.get_or_create("Alice").avatar["accessory"], "cap")


class SanitizeAvatarTests(unittest.TestCase):
    def test_non_dict_input_falls_back_to_default(self):
        self.assertEqual(sanitize_avatar("not-a-dict"), DEFAULT_AVATAR)
        self.assertEqual(sanitize_avatar(None), DEFAULT_AVATAR)

    def test_unknown_trait_values_fall_back_to_default_per_field(self):
        result = sanitize_avatar({"skin": "s2", "hairStyle": "<script>", "accessory": "none"})

        self.assertEqual(result["skin"], "s2")
        self.assertEqual(result["hairStyle"], DEFAULT_AVATAR["hairStyle"])
        self.assertEqual(result["accessory"], "none")

    def test_extra_fields_are_dropped(self):
        result = sanitize_avatar({"skin": "s2", "malicious": "<img onerror=alert(1)>"})

        self.assertNotIn("malicious", result)


if __name__ == "__main__":
    unittest.main()
