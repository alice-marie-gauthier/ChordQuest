import unittest

from models.chords import build_prompt, create_prompt_pool, family_by_id, recognize_chord


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

    def test_arpeggio_mode_uses_played_root_for_ambiguous_suspended_chords(self):
        self.assertEqual(recognize_chord([62, 64, 69], mode="arpeggio")["symbol"], "Dsus2")
        self.assertEqual(recognize_chord([69, 62, 64], mode="arpeggio")["symbol"], "Asus4")

    def test_held_mode_uses_bass_note_regardless_of_note_arrival_order(self):
        # Simulates a plaque/block chord: USB MIDI note-on order for
        # simultaneously pressed keys is hardware noise, so the lowest
        # sounding note (the bass) must decide the root either way.
        self.assertEqual(recognize_chord([62, 64, 69])["symbol"], "Dsus2")
        self.assertEqual(recognize_chord([69, 62, 64])["symbol"], "Dsus2")
        self.assertEqual(recognize_chord([64, 69, 62])["symbol"], "Dsus2")

    def test_held_is_the_default_recognition_mode(self):
        self.assertEqual(recognize_chord([69, 62, 64]), recognize_chord([69, 62, 64], mode="held"))

    def test_creates_prompt_pool_for_selected_categories(self):
        prompts = create_prompt_pool(["minor", "inversions"])

        self.assertTrue(any(prompt["category"] == "minor" for prompt in prompts))
        self.assertTrue(any(prompt["category"] == "inversions" for prompt in prompts))
        self.assertTrue(any(prompt["inversion"] == 2 for prompt in prompts))

    def test_create_prompt_pool_falls_back_to_major_for_unknown_categories(self):
        prompts = create_prompt_pool(["not-a-real-category"])

        self.assertTrue(prompts)
        self.assertTrue(all(prompt["category"] == "major" for prompt in prompts))

    def test_create_prompt_pool_drops_unknown_categories_but_keeps_known_ones(self):
        prompts = create_prompt_pool(["minor", "not-a-real-category"])

        self.assertTrue(all(prompt["category"] == "minor" for prompt in prompts))

    def test_prompt_pool_includes_sharps_and_flats(self):
        roots = {prompt["root"] for prompt in create_prompt_pool(["major"])}

        self.assertIn("C#", roots)
        self.assertIn("Db", roots)
        self.assertIn("F#", roots)
        self.assertIn("Gb", roots)

    def test_builds_flat_root_prompt(self):
        prompt = build_prompt("Bb", family_by_id("minor"))

        self.assertEqual(prompt["symbol"], "Bbm")
        self.assertEqual(prompt["root"], "Bb")
        self.assertCountEqual([note % 12 for note in prompt["midi_notes"]], [10, 1, 5])


if __name__ == "__main__":
    unittest.main()
