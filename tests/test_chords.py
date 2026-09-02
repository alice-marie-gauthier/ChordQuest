import unittest

from models.chords import (
    build_prompt,
    create_prompt_pool,
    family_by_id,
    parse_chord_symbol,
    parse_progression,
    recognize_chord,
)


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

    def test_symbol_carries_slash_chord_notation_for_inversions(self):
        # C major (C-E-G) voiced with E at the bottom is "C/E", not just
        # "C" — the displayed symbol must reflect the actual bass note the
        # way it's physically played on the keyboard, matching standard
        # slash-chord notation.
        self.assertEqual(recognize_chord([64, 67, 72])["symbol"], "C/E")
        self.assertEqual(recognize_chord([67, 72, 76])["symbol"], "C/G")
        # A major (A-C#-E) voiced with C# in the bass is "A/C#".
        self.assertEqual(recognize_chord([61, 64, 69])["symbol"], "A/C#")
        # Root position never gets a slash suffix.
        self.assertEqual(recognize_chord([48, 52, 67])["symbol"], "C")

    def test_recognizes_suspended_chords(self):
        self.assertEqual(recognize_chord([60, 62, 67])["symbol"], "Csus2")
        self.assertEqual(recognize_chord([60, 65, 67])["symbol"], "Csus4")

    def test_arpeggio_mode_uses_played_root_for_ambiguous_suspended_chords(self):
        self.assertEqual(recognize_chord([62, 64, 69], mode="arpeggio")["symbol"], "Dsus2")
        # Root is still decided by the first note played (A), but D ends up
        # the lowest-pitched note actually played here, so the symbol still
        # carries the slash suffix — the bass note is about the physical
        # keyboard, not which note was chosen as the root for matching.
        self.assertEqual(recognize_chord([69, 62, 64], mode="arpeggio")["symbol"], "Asus4/D")

    def test_held_mode_uses_bass_note_regardless_of_note_arrival_order(self):
        # Simulates a plaque/block chord: USB MIDI note-on order for
        # simultaneously pressed keys is hardware noise, so the lowest
        # sounding note (the bass) must decide the root either way.
        self.assertEqual(recognize_chord([62, 64, 69])["symbol"], "Dsus2")
        self.assertEqual(recognize_chord([69, 62, 64])["symbol"], "Dsus2")
        self.assertEqual(recognize_chord([64, 69, 62])["symbol"], "Dsus2")

    def test_held_is_the_default_recognition_mode(self):
        self.assertEqual(recognize_chord([69, 62, 64]), recognize_chord([69, 62, 64], mode="held"))

    def test_recognizes_diminished_seventh(self):
        chord = recognize_chord([60, 63, 66, 69])
        self.assertEqual(chord["symbol"], "Cdim7")
        self.assertEqual(chord["family_id"], "diminished7")

    def test_recognizes_minor_major_seventh(self):
        chord = recognize_chord([60, 63, 67, 71])
        self.assertEqual(chord["symbol"], "CmMaj7")
        self.assertEqual(chord["family_id"], "minorMajor7")

    def test_recognizes_dominant_seventh_sus4(self):
        chord = recognize_chord([60, 65, 67, 70])
        self.assertEqual(chord["symbol"], "C7sus4")
        self.assertEqual(chord["family_id"], "dominant7sus4")

    def test_recognizes_ninth_sus4(self):
        chord = recognize_chord([60, 65, 67, 70, 74])
        self.assertEqual(chord["symbol"], "C9sus4")
        self.assertEqual(chord["family_id"], "ninthSus4")

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


class ChordSymbolParsingTests(unittest.TestCase):
    def test_parses_plain_major_and_minor(self):
        self.assertEqual(parse_chord_symbol("C")["family_id"], "major")
        self.assertEqual(parse_chord_symbol("Am")["family_id"], "minor")
        self.assertEqual(parse_chord_symbol("Am")["root"], "A")

    def test_parses_sharp_and_flat_roots(self):
        self.assertEqual(parse_chord_symbol("C#")["root"], "C#")
        self.assertEqual(parse_chord_symbol("Bbm7")["root"], "Bb")
        self.assertEqual(parse_chord_symbol("Bbm7")["family_id"], "minor7")

    def test_prefers_the_longest_matching_suffix(self):
        # "m7b5" must not be misread as minor ("m") with leftover "7b5".
        self.assertEqual(parse_chord_symbol("Bm7b5")["family_id"], "halfDiminished")
        self.assertEqual(parse_chord_symbol("Cmaj7")["family_id"], "major7")
        self.assertEqual(parse_chord_symbol("Dm7")["family_id"], "minor7")

    def test_parses_suspensions_and_extensions(self):
        self.assertEqual(parse_chord_symbol("Dsus4")["family_id"], "sus4")
        self.assertEqual(parse_chord_symbol("Gsus2")["family_id"], "sus2")
        self.assertEqual(parse_chord_symbol("G9")["family_id"], "ninth")

    def test_parses_the_newly_added_seventh_and_sus_chords(self):
        self.assertEqual(parse_chord_symbol("Cdim7")["family_id"], "diminished7")
        self.assertEqual(parse_chord_symbol("CmMaj7")["family_id"], "minorMajor7")
        self.assertEqual(parse_chord_symbol("C7sus4")["family_id"], "dominant7sus4")
        self.assertEqual(parse_chord_symbol("C9sus4")["family_id"], "ninthSus4")

    def test_is_forgiving_of_whitespace_and_suffix_casing(self):
        self.assertEqual(parse_chord_symbol("  Cmaj7  ")["family_id"], "major7")
        self.assertEqual(parse_chord_symbol("CMAJ7")["family_id"], "major7")
        # Regression test: "mMaj7" is a mixed-case suffix (by convention, for
        # its display symbol) — a naive `==` match against the lowercased
        # input would silently never match it. See parse_chord_symbol's
        # suffix-lookup comment for the full story.
        self.assertEqual(parse_chord_symbol("CmMaj7")["family_id"], "minorMajor7")
        self.assertEqual(parse_chord_symbol("Cmmaj7")["family_id"], "minorMajor7")
        self.assertEqual(parse_chord_symbol("CMMAJ7")["family_id"], "minorMajor7")

    def test_parsed_chords_are_tagged_as_custom_category_root_position(self):
        prompt = parse_chord_symbol("F")
        self.assertEqual(prompt["category"], "custom")
        self.assertEqual(prompt["inversion"], 0)

    def test_rejects_empty_symbol(self):
        with self.assertRaises(ValueError):
            parse_chord_symbol("")

    def test_rejects_invalid_root_letter(self):
        with self.assertRaises(ValueError):
            parse_chord_symbol("H")

    def test_rejects_unknown_quality(self):
        with self.assertRaises(ValueError):
            parse_chord_symbol("Cxyz")

    def test_defaults_to_a_quarter_note_when_no_duration_given(self):
        self.assertEqual(parse_chord_symbol("C")["duration_beats"], 1.0)

    def test_parses_multiplier_durations(self):
        self.assertEqual(parse_chord_symbol("C:2")["duration_beats"], 2.0)
        self.assertEqual(parse_chord_symbol("C:4")["duration_beats"], 4.0)

    def test_parses_divisor_durations(self):
        self.assertEqual(parse_chord_symbol("C:/2")["duration_beats"], 0.5)
        self.assertEqual(parse_chord_symbol("C:/4")["duration_beats"], 0.25)

    def test_duration_suffix_does_not_break_quality_suffix_matching(self):
        # "G7" on its own is a dominant 7th; the colon is what disambiguates
        # a trailing digit as a duration instead of part of the quality.
        prompt = parse_chord_symbol("G7:2")
        self.assertEqual(prompt["family_id"], "dominant7")
        self.assertEqual(prompt["duration_beats"], 2.0)

    def test_rejects_malformed_duration(self):
        with self.assertRaises(ValueError):
            parse_chord_symbol("C:0")
        with self.assertRaises(ValueError):
            parse_chord_symbol("C:abc")
        with self.assertRaises(ValueError):
            parse_chord_symbol("C:/0")
        with self.assertRaises(ValueError):
            parse_chord_symbol("C:")

    def test_rejects_duration_with_no_chord_before_colon(self):
        with self.assertRaises(ValueError):
            parse_chord_symbol(":2")


class ProgressionParsingTests(unittest.TestCase):
    def test_parses_a_full_progression_in_order(self):
        prompts, errors = parse_progression(["C", "G", "Am", "F"])

        self.assertEqual(errors, [])
        self.assertEqual([prompt["symbol"] for prompt in prompts], ["C", "G", "Am", "F"])

    def test_skips_blank_entries(self):
        prompts, errors = parse_progression(["C", "", "  ", "G"])

        self.assertEqual(len(prompts), 2)
        self.assertEqual(errors, [])

    def test_collects_errors_without_aborting_the_rest_of_the_progression(self):
        prompts, errors = parse_progression(["C", "NotAChord", "G"])

        self.assertEqual([prompt["symbol"] for prompt in prompts], ["C", "G"])
        self.assertEqual(len(errors), 1)
        self.assertEqual(errors[0]["index"], 1)
        self.assertEqual(errors[0]["chord"], "NotAChord")


if __name__ == "__main__":
    unittest.main()
