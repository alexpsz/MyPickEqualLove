from __future__ import annotations

import importlib.util
import sys
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import Mock, patch


SCRIPT_PATH = Path(__file__).with_name("sync-project-discography.py")
SPEC = importlib.util.spec_from_file_location("sync_project_discography", SCRIPT_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load {SCRIPT_PATH}")
SYNC = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = SYNC
SPEC.loader.exec_module(SYNC)


class DiscographyMergeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.config = SYNC.ProjectConfig(
            project_id="equal-love",
            official_base="https://equal-love.jp",
            group_artist="=LOVE",
            utanet_artist_id="1",
            utanet_artist_path="/artist/1/",
            sister_group_markers=("≠ME", "≒JOY"),
        )
        self.official_song = {
            "title": {"ja": "新曲", "romaji": "Shinkyoku"},
            "releaseTitle": {"ja": "新曲シングル", "romaji": "Shinkyoku Shinguru"},
            "releaseType": "single",
            "releaseDate": "2099-01-01",
            "trackNo": 1,
            "trackType": "title",
            "coverSourceUrl": "https://example.com/cover.jpg",
            "officialUrl": "https://example.com/release",
        }
        self.credit = {
            "title": "新曲",
            "artist": "=LOVE",
            "lyricist": "作詞者",
            "composer": "作曲者",
            "arranger": "編曲者",
            "url": "https://example.com/credits",
        }

    def test_complete_official_announcement_is_kept_without_credits(self) -> None:
        songs, stats = SYNC.merge_official_songs_with_credits(
            {"new": self.official_song},
            {},
            {},
        )

        self.assertEqual(songs["new"]["sourceStatus"], "announced")
        self.assertNotIn("credit", songs["new"])
        self.assertEqual(stats["officialMetadataWithoutCredits"], 1)

    def test_incomplete_announcement_is_excluded(self) -> None:
        incomplete = {**self.official_song, "coverSourceUrl": None}
        songs, stats = SYNC.merge_official_songs_with_credits(
            {"new": incomplete},
            {},
            {},
        )

        self.assertEqual(songs, {})
        self.assertEqual(stats["excludedIncompleteOfficialAnnouncements"], 1)

    def test_released_official_song_without_credits_is_marked_pending(self) -> None:
        released = {**self.official_song, "releaseDate": "2020-01-01"}

        songs, _ = SYNC.merge_official_songs_with_credits(
            {"new": released},
            {},
            {},
        )

        self.assertEqual(songs["new"]["sourceStatus"], "credits_pending")

    def test_current_credit_upgrades_an_announcement(self) -> None:
        songs, _ = SYNC.merge_official_songs_with_credits(
            {"new": self.official_song},
            {"new": self.credit},
            {},
        )

        self.assertEqual(songs["new"]["credit"], self.credit)
        self.assertEqual(songs["new"]["_creditOrigin"], "current")
        self.assertEqual(songs["new"]["sourceStatus"], "announced")
        self.assertEqual(
            songs["new"]["sourceNote"],
            SYNC.ANNOUNCED_CREDITS_VERIFIED_SOURCE_NOTE,
        )
        self.assertIn("announced", songs["new"]["tags"])

    def test_partial_current_credit_is_deferred_without_partial_payload(self) -> None:
        partial_credit = {**self.credit, "arranger": ""}

        songs, stats = SYNC.merge_official_songs_with_credits(
            {"new": self.official_song},
            {"new": partial_credit},
            {},
        )

        self.assertEqual(songs["new"]["sourceStatus"], "announced")
        self.assertNotIn("credit", songs["new"])
        self.assertEqual(stats["incompleteCurrentCreditsDeferred"], 1)

    def test_existing_credits_survive_a_temporary_credit_source_gap(self) -> None:
        existing = {
            "title": {"ja": "新曲", "romaji": "Shinkyoku"},
            "artist": {"ja": "=LOVE", "romaji": "Equal Love"},
            "credits": {
                "lyricist": {"ja": "作詞者", "romaji": "Sakushi Sha"},
                "composer": {"ja": "作曲者", "romaji": "Sakkyoku Sha"},
                "arranger": {"ja": "編曲者", "romaji": "Henkyoku Sha"},
            },
            "creditSourceUrl": "https://example.com/credits",
        }
        songs, stats = SYNC.merge_official_songs_with_credits(
            {"new": self.official_song},
            {},
            {"new": existing},
        )

        self.assertEqual(songs["new"]["_creditOrigin"], "existing")
        self.assertEqual(stats["preservedExistingCredits"], 1)

    def test_existing_released_song_is_kept_exactly(self) -> None:
        existing = {
            "id": "stable-id",
            "title": {"ja": "既存曲", "romaji": "Curated Romaji"},
            "sourceStatus": "released",
            "tags": ["manual-tag"],
        }
        scraped = {"credit": self.credit, "_creditOrigin": "current"}

        merged = SYNC.merge_existing_song_update(existing, scraped)

        self.assertEqual(merged, existing)
        self.assertIsNot(merged, existing)

    def test_future_announcement_gains_credits_but_stays_announced(self) -> None:
        existing = {
            "id": "future-song",
            "releaseDate": "2099-01-01",
            "sourceStatus": "announced",
            "sourceNote": SYNC.ANNOUNCED_SOURCE_NOTE,
            "tags": ["announced", "single"],
        }
        scraped = {"credit": self.credit, "_creditOrigin": "current"}

        merged = SYNC.merge_existing_song_update(
            existing,
            scraped,
            today=date(2098, 12, 31),
        )

        self.assertEqual(merged["sourceStatus"], "announced")
        self.assertIn("credits", merged)
        self.assertEqual(
            merged["sourceNote"],
            SYNC.ANNOUNCED_CREDITS_VERIFIED_SOURCE_NOTE,
        )

    def test_verified_group_credit_fills_pending_participants(self) -> None:
        existing = {
            "id": "future-song",
            "artist": {"ja": "=LOVE", "romaji": "Equal Love"},
            "releaseDate": "2099-01-01",
            "sourceStatus": "announced",
            "sourceNote": SYNC.ANNOUNCED_SOURCE_NOTE,
            "ownershipEvidence": "official-title-track",
            "tags": ["announced", "single"],
        }
        members = [
            {"id": "active", "name": {"ja": "現役"}, "active": True},
            {
                "id": "graduated-later",
                "name": {"ja": "卒業予定"},
                "active": False,
                "graduationDate": "2099-02-01",
            },
        ]
        scraped = {"credit": self.credit, "_creditOrigin": "current"}

        merged = SYNC.merge_existing_song_update(
            existing,
            scraped,
            today=date(2098, 12, 31),
            config=self.config,
            members=members,
            member_name_to_id={"現役": "active", "卒業予定": "graduated-later"},
        )

        self.assertEqual(merged["ownershipEvidence"], "verified-credits")
        self.assertEqual(merged["memberIds"], ["active", "graduated-later"])

    def test_released_announcement_is_promoted_after_credits_arrive(self) -> None:
        existing = {
            "id": "released-song",
            "releaseDate": "2099-01-01",
            "sourceStatus": "announced",
            "sourceNote": SYNC.ANNOUNCED_SOURCE_NOTE,
            "tags": ["announced", "single"],
        }
        scraped = {"credit": self.credit, "_creditOrigin": "current"}

        merged = SYNC.merge_existing_song_update(
            existing,
            scraped,
            today=date(2099, 1, 1),
        )

        self.assertEqual(merged["sourceStatus"], "released")
        self.assertNotIn("sourceNote", merged)
        self.assertNotIn("announced", merged["tags"])

    def test_announcement_becomes_pending_on_release_day_without_credits(self) -> None:
        existing = {
            "id": "released-song",
            "releaseDate": "2099-01-01",
            "sourceStatus": "announced",
            "sourceNote": SYNC.ANNOUNCED_SOURCE_NOTE,
            "tags": ["announced", "single"],
        }

        merged = SYNC.merge_existing_song_update(
            existing,
            {},
            today=date(2099, 1, 1),
        )

        self.assertEqual(merged["sourceStatus"], "credits_pending")
        self.assertIn("credits_pending", merged["tags"])
        self.assertNotIn("announced", merged["tags"])

    def test_missing_announcement_with_existing_credits_releases_on_schedule(self) -> None:
        existing = {
            "id": "released-song",
            "title": {"ja": "新曲", "romaji": "Shinkyoku"},
            "artist": {"ja": "=LOVE", "romaji": "Equal Love"},
            "releaseDate": "2099-01-01",
            "sourceStatus": "announced",
            "sourceNote": SYNC.ANNOUNCED_CREDITS_VERIFIED_SOURCE_NOTE,
            "tags": ["announced", "single"],
            "credits": {
                "lyricist": {"ja": "作詞者", "romaji": "Sakushi Sha"},
                "composer": {"ja": "作曲者", "romaji": "Sakkyoku Sha"},
                "arranger": {"ja": "編曲者", "romaji": "Henkyoku Sha"},
            },
            "creditSourceUrl": "https://www.uta-net.com/song/1/",
        }

        merged = SYNC.merge_existing_song_update(
            existing,
            {},
            today=date(2099, 1, 1),
        )

        self.assertEqual(merged["sourceStatus"], "released")
        self.assertNotIn("sourceNote", merged)
        self.assertNotIn("announced", merged["tags"])

    def test_missing_future_announcement_remains_byte_stable(self) -> None:
        existing = {
            "id": "future-song",
            "releaseDate": "2099-01-02",
            "sourceStatus": "announced",
            "sourceNote": SYNC.ANNOUNCED_SOURCE_NOTE,
            "tags": ["announced", "single"],
        }

        merged = SYNC.merge_existing_song_update(
            existing,
            {},
            today=date(2099, 1, 1),
        )

        self.assertEqual(merged, existing)

    def test_known_title_alias_preserves_correct_katakana(self) -> None:
        self.assertEqual(SYNC.clean_title("ナツマトぺ", self.config), "ナツマトペ")

    def test_title_key_preserves_long_vowels_and_hyphens(self) -> None:
        self.assertNotEqual(
            SYNC.title_key("ヒーロー", self.config),
            SYNC.title_key("ヒロ", self.config),
        )
        self.assertNotEqual(
            SYNC.title_key("A-B", self.config),
            SYNC.title_key("AB", self.config),
        )
        self.assertEqual(
            SYNC.title_key("『夏』", self.config),
            SYNC.title_key("夏", self.config),
        )

    def test_release_preference_recognizes_type_a_with_or_without_hyphen(self) -> None:
        type_e = {
            **self.official_song,
            "releaseTitle": {"ja": "新曲[CD Only/Type E]", "romaji": "E"},
            "officialUrl": "https://equal-love.jp/discography/detail/5/",
        }
        type_a = {
            **self.official_song,
            "releaseTitle": {"ja": "新曲[CD+DVD/Type A]", "romaji": "A"},
            "officialUrl": "https://equal-love.jp/discography/detail/1/",
        }
        type_a_hyphen = {
            **type_a,
            "releaseTitle": {"ja": "新曲[CD+DVD/Type-A]", "romaji": "A"},
        }

        self.assertTrue(SYNC.should_prefer_release(type_a, type_e))
        self.assertTrue(SYNC.should_prefer_release(type_a_hyphen, type_e))
        self.assertFalse(SYNC.should_prefer_release(type_e, type_a))
        self.assertEqual(SYNC.release_edition_letter(type_a["releaseTitle"]["ja"]), "A")

    def test_explicit_track_owner_is_extracted_before_title_cleanup(self) -> None:
        owner, title = SYNC.split_explicit_track_owner("新曲（≒JOY）")
        self.assertEqual(owner, "nearly-equal-joy")
        self.assertEqual(title, "新曲")

    def test_no_credit_title_track_has_current_group_ownership_evidence(self) -> None:
        title_track = {
            **self.official_song,
            "releaseTitle": {"ja": "新曲[CD+DVD/Type A]", "romaji": "Shinkyoku"},
        }
        decision, evidence = SYNC.resolve_new_song_ownership(
            self.config,
            title_track,
            None,
            key="new",
            committed_by_key={},
            known_other_project_title_keys=set(),
        )
        self.assertEqual((decision, evidence), ("ACCEPT", "official-title-track"))

    def test_unlabeled_new_coupling_requires_review(self) -> None:
        coupling = {
            **self.official_song,
            "releaseTitle": {"ja": "別のシングル", "romaji": "Betsu"},
            "trackNo": 2,
            "trackType": "coupling",
            "_editionEvidence": [
                "2099-01-01|betsu|C",
                "2099-01-01|betsu|D",
            ],
        }
        decision, reason = SYNC.resolve_new_song_ownership(
            self.config,
            coupling,
            None,
            key="new",
            committed_by_key={},
            known_other_project_title_keys=set(),
        )
        self.assertEqual(decision, "REVIEW")
        self.assertIn("no credits", reason)

    def test_type_a_plus_two_editions_coupling_is_accepted(self) -> None:
        coupling = {
            **self.official_song,
            "releaseTitle": {"ja": "別のシングル[Type A]", "romaji": "Betsu"},
            "trackNo": 2,
            "trackType": "coupling",
            "_editionEvidence": [
                "2099-01-01|betsu|A",
                "2099-01-01|betsu|B",
                "2099-01-01|betsu|C",
            ],
        }
        decision, evidence = SYNC.resolve_new_song_ownership(
            self.config,
            coupling,
            None,
            key="new",
            committed_by_key={},
            known_other_project_title_keys=set(),
        )
        self.assertEqual((decision, evidence), ("ACCEPT", "official-multi-edition"))

    def test_type_a_plus_one_other_edition_requires_review(self) -> None:
        coupling = {
            **self.official_song,
            "releaseTitle": {"ja": "別のシングル[Type A]", "romaji": "Betsu"},
            "trackNo": 2,
            "trackType": "coupling",
            "_editionEvidence": [
                "2099-01-01|betsu|A",
                "2099-01-01|betsu|B",
            ],
        }
        decision, reason = SYNC.resolve_new_song_ownership(
            self.config,
            coupling,
            None,
            key="new",
            committed_by_key={},
            known_other_project_title_keys=set(),
        )
        self.assertEqual(decision, "REVIEW")
        self.assertIn("at least two other same-release editions", reason)

    def test_single_edition_album_track_requires_review_without_credits(self) -> None:
        album_track = {
            **self.official_song,
            "releaseType": "album",
            "trackNo": 5,
            "trackType": "album",
        }
        decision, evidence = SYNC.resolve_new_song_ownership(
            self.config,
            album_track,
            None,
            key="new",
            committed_by_key={},
            known_other_project_title_keys=set(),
        )
        self.assertEqual(decision, "REVIEW")

    def test_different_release_families_do_not_create_edition_evidence(self) -> None:
        coupling = {
            **self.official_song,
            "trackNo": 2,
            "trackType": "coupling",
            "_editionEvidence": [
                "2099-01-01|first|A",
                "2099-02-01|second|B",
            ],
        }
        decision, _ = SYNC.resolve_new_song_ownership(
            self.config,
            coupling,
            None,
            key="new",
            committed_by_key={},
            known_other_project_title_keys=set(),
        )
        self.assertEqual(decision, "REVIEW")

    def test_dual_a_side_second_title_is_a_title_track(self) -> None:
        second_title = {
            **self.official_song,
            "title": {"ja": "第二曲", "romaji": "Daini Kyoku"},
            "releaseTitle": {
                "ja": "「第一曲/第二曲」<CD+DVD/Type A>",
                "romaji": "Daburu A",
            },
            "trackNo": 2,
        }
        decision, evidence = SYNC.resolve_new_song_ownership(
            self.config,
            second_title,
            None,
            key="second",
            committed_by_key={},
            known_other_project_title_keys=set(),
        )
        self.assertEqual((decision, evidence), ("ACCEPT", "official-title-track"))

    def test_slash_inside_a_single_title_still_matches_the_full_title(self) -> None:
        slash_title = {
            **self.official_song,
            "title": {"ja": "24/7", "romaji": "24/7"},
            "releaseTitle": {"ja": "24/7[Type A]", "romaji": "24/7"},
        }

        self.assertTrue(SYNC.is_official_title_track(self.config, slash_title))

    def test_sister_group_track_label_rejects_current_project(self) -> None:
        labeled = {**self.official_song, "_explicitOwners": ["nearly-equal-joy"]}
        decision, _ = SYNC.resolve_new_song_ownership(
            self.config,
            labeled,
            None,
            key="new",
            committed_by_key={},
            known_other_project_title_keys=set(),
        )
        self.assertEqual(decision, "REJECT")

    def test_group_members_include_members_active_on_release_date(self) -> None:
        members = [
            {"id": "active", "active": True},
            {
                "id": "graduated-after-release",
                "active": False,
                "graduationDate": "2023-01-01",
            },
            {
                "id": "graduated-before-release",
                "active": False,
                "graduationDate": "2021-01-01",
            },
        ]

        self.assertEqual(
            SYNC.group_member_ids_for_release(members, "2022-01-01"),
            ["active", "graduated-after-release"],
        )

    def test_known_sister_group_song_without_credit_is_deferred(self) -> None:
        decision, _ = SYNC.resolve_new_song_ownership(
            self.config,
            self.official_song,
            None,
            key="sister-song",
            committed_by_key={},
            known_other_project_title_keys={"sister-song"},
        )
        self.assertEqual(decision, "REJECT")

    def test_participating_credit_allows_a_cross_project_title(self) -> None:
        decision, evidence = SYNC.resolve_new_song_ownership(
            self.config,
            self.official_song,
            self.credit,
            key="shared-song",
            committed_by_key={},
            known_other_project_title_keys={"shared-song"},
        )
        self.assertEqual((decision, evidence), ("ACCEPT", "verified-credits"))

    def test_shared_credit_requires_manual_review(self) -> None:
        shared_credit = {**self.credit, "artist": "イコノイジョイ"}
        decision, _ = SYNC.resolve_new_song_ownership(
            self.config,
            self.official_song,
            shared_credit,
            key="shared-song",
            committed_by_key={},
            known_other_project_title_keys=set(),
        )
        self.assertEqual(decision, "REVIEW")

    def test_unknown_credit_artist_requires_manual_review(self) -> None:
        unknown_credit = {**self.credit, "artist": "Unknown Artist"}
        decision, _ = SYNC.resolve_new_song_ownership(
            self.config,
            self.official_song,
            unknown_credit,
            key="unknown",
            committed_by_key={},
            known_other_project_title_keys=set(),
        )
        self.assertEqual(decision, "REVIEW")

    def test_partial_current_group_credit_proves_artist_not_full_credits(self) -> None:
        partial_credit = {
            **self.credit,
            "arranger": "",
            "url": "https://www.uta-net.com/song/1/",
        }
        decision, evidence = SYNC.resolve_new_song_ownership(
            self.config,
            self.official_song,
            partial_credit,
            key="new",
            committed_by_key={},
            known_other_project_title_keys=set(),
        )
        self.assertEqual((decision, evidence), ("ACCEPT", "verified-artist"))

    def test_partial_artist_evidence_without_trusted_source_requires_review(self) -> None:
        partial_credit = {**self.credit, "arranger": ""}
        decision, reason = SYNC.resolve_new_song_ownership(
            self.config,
            self.official_song,
            partial_credit,
            key="new",
            committed_by_key={},
            known_other_project_title_keys=set(),
        )
        self.assertEqual(decision, "REVIEW")
        self.assertIn("trusted Uta-Net", reason)

    def test_pending_committed_song_rechecks_conflicting_credit_owner(self) -> None:
        sister_credit = {**self.credit, "artist": "≒JOY"}
        decision, reason = SYNC.resolve_new_song_ownership(
            self.config,
            self.official_song,
            sister_credit,
            key="new",
            committed_by_key={"new": {"sourceStatus": "announced"}},
            known_other_project_title_keys=set(),
        )
        self.assertEqual(decision, "REVIEW")
        self.assertIn("conflict", reason)

    def test_release_contract_rejects_an_unparsed_real_detail(self) -> None:
        release = SYNC.Release(
            url="https://equal-love.jp/discography/detail/999/",
            title="新曲",
            release_date="2099-01-01",
            release_type="single",
            cover_source_url="https://equal-love.jp/cover.jpg",
            tracks=[],
        )

        with self.assertRaisesRegex(RuntimeError, "detail/999/.*CD tracks"):
            SYNC.validate_release_contract(release)

    def test_release_contract_allows_an_explicit_placeholder(self) -> None:
        release = SYNC.Release(
            url="https://equal-love.jp/discography/detail/998/",
            title="タイトル未定",
            release_date="",
            release_type="single",
            cover_source_url=None,
            tracks=[],
        )

        SYNC.validate_release_contract(release)

    def test_release_contract_allows_only_explicit_legacy_empty_track_pages(self) -> None:
        release = SYNC.Release(
            url="https://equal-love.jp/discography/detail/78/",
            title="ナツマトペ[CD+DVD/Type-A]",
            release_date="2023-07-19",
            release_type="single",
            cover_source_url="https://equal-love.jp/cover.jpg",
            tracks=[],
        )

        SYNC.validate_release_contract(release, allow_empty_tracks=True)

    def test_distinct_titles_must_not_silently_share_a_title_key(self) -> None:
        titles_by_key: dict[str, str] = {}
        SYNC.register_official_title_key(self.config, titles_by_key, "新・曲")
        with self.assertRaisesRegex(RuntimeError, "title-key collision"):
            SYNC.register_official_title_key(self.config, titles_by_key, "新曲")

    def test_committed_catalog_title_collision_fails_closed(self) -> None:
        songs = [
            {"id": "one", "title": {"ja": "新・曲"}},
            {"id": "two", "title": {"ja": "新曲"}},
        ]

        with self.assertRaisesRegex(RuntimeError, "title-key collision"):
            SYNC.index_songs_by_title_key(
                self.config,
                songs,
                source="test catalog",
            )

    def test_utanet_title_collision_fails_closed(self) -> None:
        rows: dict[str, dict[str, str]] = {}
        SYNC.register_credit_row(self.config, rows, self.credit)
        colliding = {**self.credit, "title": "新・曲"}

        with self.assertRaisesRegex(RuntimeError, "title-key collision"):
            SYNC.register_credit_row(self.config, rows, colliding)

    def test_catalog_coverage_allows_bounded_release_turnover(self) -> None:
        committed = [
            {
                "title": {"ja": f"既存曲{index}"},
                "officialUrl": f"https://equal-love.jp/discography/detail/{index}/",
            }
            for index in range(15)
        ]
        discovered = {
            SYNC.title_key(song["title"]["ja"], self.config): song
            for song in committed[:12]
        }
        discovered.update(
            {
                SYNC.title_key(f"新曲{index}", self.config): {"title": f"新曲{index}"}
                for index in range(3)
            },
        )

        SYNC.validate_official_catalog_coverage(
            self.config,
            discovered,
            committed,
        )

    def test_catalog_coverage_rejects_a_partial_parse(self) -> None:
        committed = [
            {
                "title": {"ja": f"既存曲{index}"},
                "officialUrl": f"https://equal-love.jp/discography/detail/{index}/",
            }
            for index in range(15)
        ]
        discovered = {
            SYNC.title_key(song["title"]["ja"], self.config): song
            for song in committed[:8]
        }

        with self.assertRaises(RuntimeError):
            SYNC.validate_official_catalog_coverage(
                self.config,
                discovered,
                committed,
            )

    def test_cover_download_allowlist_rejects_arbitrary_hosts(self) -> None:
        self.assertTrue(
            SYNC.is_trusted_cover_url(
                self.config,
                "https://s3-aop.plusmember.jp/cover.jpg",
            ),
        )
        self.assertFalse(
            SYNC.is_trusted_cover_url(
                self.config,
                "https://attacker.example/cover.jpg",
            ),
        )

    def test_cover_redirect_is_validated_before_the_next_request(self) -> None:
        redirect = Mock(
            status_code=302,
            headers={"Location": "https://attacker.example/cover.jpg"},
        )
        with patch.object(SYNC.SESSION, "get", return_value=redirect) as request:
            with self.assertRaisesRegex(RuntimeError, "untrusted cover URL"):
                SYNC.get_trusted_cover_response(
                    self.config,
                    "https://equal-love.jp/cover.jpg",
                )

        request.assert_called_once_with(
            "https://equal-love.jp/cover.jpg",
            timeout=30,
            allow_redirects=False,
        )
        redirect.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
