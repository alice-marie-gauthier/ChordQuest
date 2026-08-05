import unittest

from models.progress import ChordStats, ProgressStore, mastery_score


class ChordStatsTests(unittest.TestCase):
    def test_success_rate_and_average_response_default_to_zero(self):
        stats = ChordStats()

        self.assertEqual(stats.success_rate, 0.0)
        self.assertEqual(stats.average_response_ms, 0)

    def test_success_rate_and_average_response_are_computed(self):
        stats = ChordStats(attempts=4, successes=3, total_response_ms=4000)

        self.assertEqual(stats.success_rate, 0.75)
        self.assertEqual(stats.average_response_ms, 1000)

    def test_mastery_score_is_zero_with_no_attempts(self):
        self.assertEqual(mastery_score(ChordStats()), 0)

    def test_mastery_score_rewards_speed_and_accuracy(self):
        fast_accurate = ChordStats(attempts=8, successes=8, total_response_ms=8 * 900)
        slow_accurate = ChordStats(attempts=8, successes=8, total_response_ms=8 * 4000)

        self.assertGreater(mastery_score(fast_accurate), mastery_score(slow_accurate))

    def test_mastery_score_grows_with_confidence(self):
        few_attempts = ChordStats(attempts=1, successes=1, total_response_ms=900)
        many_attempts = ChordStats(attempts=8, successes=8, total_response_ms=8 * 900)

        self.assertGreater(mastery_score(many_attempts), mastery_score(few_attempts))


class ProgressStoreTests(unittest.TestCase):
    def test_record_attempt_accumulates_stats_per_key(self):
        store = ProgressStore()
        store.record_attempt("major:major", True, 900)
        store.record_attempt("major:major", False, 1400)
        store.record_attempt("minor:minor", True, 800)

        snapshot = {entry["key"]: entry for entry in store.snapshot()}

        self.assertEqual(snapshot["major:major"]["attempts"], 2)
        self.assertEqual(snapshot["major:major"]["successes"], 1)
        self.assertEqual(snapshot["minor:minor"]["attempts"], 1)

    def test_snapshot_is_sorted_by_key(self):
        store = ProgressStore()
        store.record_attempt("sevenths:minor7", True, 1000)
        store.record_attempt("major:major", True, 1000)

        keys = [entry["key"] for entry in store.snapshot()]

        self.assertEqual(keys, sorted(keys))

    def test_reset_clears_all_stats(self):
        store = ProgressStore()
        store.record_attempt("minor:minor", True, 800)

        store.reset()

        self.assertEqual(store.snapshot(), [])


if __name__ == "__main__":
    unittest.main()
