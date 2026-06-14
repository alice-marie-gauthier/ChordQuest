import unittest

from models.chords import create_prompt_pool, recognize_chord


class ChordRecognitionTests(unittest.TestCase):
    def test_recognizes_major_independent_of_octave(self):
        chord = recognize_chord([48, 52, 67])

        self.assertIsNotNone(chord)
        self.assertEqual(chord["symbol"], "C")
        self.assertEqual(chord["family_id"], "major")
        self.assertEqual(chord["quality"], "Major")

    def test_recognizes_minor_seventh(self):
        chord = recognize_chord([50, 53, 57, 60])

        self.assertIsNotNone(chord)
        self.assertEqual(chord["symbol"], "Dm7")

    def test_detects_inversions(self):
        first = recognize_chord([64, 67, 72])
        second = recognize_chord([67, 72, 76])

        self.assertEqual(first["inversion"], 1)
        self.assertEqual(second["inversion"], 2)

    def test_recognizes_suspended_chords(self):
        self.assertEqual(recognize_chord([60, 62, 67])["symbol"], "Csus2")
        self.assertEqual(recognize_chord([60, 65, 67])["symbol"], "Csus4")

    def test_creates_prompt_pool_for_selected_categories(self):
        prompts = create_prompt_pool(["minor", "inversions"])

        self.assertTrue(any(prompt["category"] == "minor" for prompt in prompts))
        self.assertTrue(any(prompt["category"] == "inversions" for prompt in prompts))
        self.assertTrue(any(prompt["inversion"] == 2 for prompt in prompts))


if __name__ == "__main__":
    unittest.main()
