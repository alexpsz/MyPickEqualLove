from __future__ import annotations

import importlib.util
import json
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

    def test_complete_official_announcement_without_credits_is_review_only(self) -> None:
        songs, stats = SYNC.merge_official_songs_with_credits(
            {"new": self.official_song},
            {},
            {},
        )

        self.assertEqual(songs, {})
        self.assertEqual(stats["officialMetadataWithoutCredits"], 1)
        self.assertEqual(stats["reviewCandidates"][0]["kind"], "credits")

    def test_incomplete_announcement_is_excluded(self) -> None:
        incomplete = {**self.official_song, "coverSourceUrl": None}
        songs, stats = SYNC.merge_official_songs_with_credits(
            {"new": incomplete},
            {},
            {},
        )

        self.assertEqual(songs, {})
        self.assertEqual(stats["excludedIncompleteOfficialAnnouncements"], 1)

    def test_released_official_song_without_credits_is_review_only(self) -> None:
        released = {**self.official_song, "releaseDate": "2020-01-01"}

        songs, stats = SYNC.merge_official_songs_with_credits(
            {"new": released},
            {},
            {},
        )

        self.assertEqual(songs, {})
        self.assertEqual(len(stats["reviewCandidates"]), 1)

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

        self.assertEqual(songs, {})
        self.assertEqual(stats["incompleteCurrentCreditsDeferred"], 1)
        self.assertEqual(len(stats["reviewCandidates"]), 1)

    def test_unknown_credit_marker_never_counts_as_complete(self) -> None:
        placeholder = {**self.credit, "arranger": "未確認"}
        self.assertFalse(SYNC.has_complete_credit_row(placeholder))
        self.assertIsNone(
            SYNC.credit_from_existing_song(
                {
                    "title": {"ja": "新曲"},
                    "artist": {"ja": "=LOVE"},
                    "credits": {
                        "lyricist": {"ja": "作詞者"},
                        "composer": {"ja": "作曲者"},
                        "arranger": {"ja": "未確認"},
                    },
                },
            ),
        )

    def test_forbidden_title_fallback_stops_after_first_needed_title(self) -> None:
        response = Mock(status_code=403)
        forbidden = SYNC.requests.HTTPError("forbidden", response=response)
        official_songs = {
            "one": self.official_song,
            "two": {
                **self.official_song,
                "title": {"ja": "次の曲", "romaji": "Tsugi"},
            },
        }
        with patch.object(
            SYNC,
            "search_utanet_credit",
            side_effect=forbidden,
        ) as search:
            stats = SYNC.resolve_needed_utanet_credits(
                self.config,
                official_songs,
                {},
                {},
            )
        self.assertEqual(stats["fallbackAttempts"], 1)
        self.assertEqual(stats["fallbackHttpStatuses"], [403])
        self.assertEqual(search.call_count, 1)

    def test_title_fallback_queries_only_records_that_need_credits(self) -> None:
        existing = {
            "title": {"ja": "既存曲"},
            "artist": {"ja": "=LOVE"},
            "credits": {
                "lyricist": {"ja": "作詞者"},
                "composer": {"ja": "作曲者"},
                "arranger": {"ja": "編曲者"},
            },
        }
        new_song = {
            **self.official_song,
            "title": {"ja": "新曲", "romaji": "Shinkyoku"},
        }
        credit_rows: dict[str, dict[str, str]] = {}
        with patch.object(
            SYNC,
            "search_utanet_credit",
            return_value=self.credit,
        ) as search:
            stats = SYNC.resolve_needed_utanet_credits(
                self.config,
                {"old": self.official_song, "new": new_song},
                {"old": existing},
                credit_rows,
            )
        search.assert_called_once_with(self.config, "新曲")
        self.assertEqual(stats["searchedCreditRows"], 1)
        self.assertIn(SYNC.title_key("新曲", self.config), credit_rows)

    def test_release_news_discovers_only_unrepresented_cd_tracks(self) -> None:
        list_soup = SYNC.BeautifulSoup(
            """
            <a href="/news/detail/11815">
              リリース 2026.08.03
              8/26(水)発売 =LOVE 21stシングル「恋、はじめました。」アートワーク公開！
            </a>
            """,
            "html.parser",
        )
        detail_soup = SYNC.BeautifulSoup(
            """
            <p>《CD収録内容》</p>
            <p>1. 恋、はじめました。</p>
            <p>2. カップリングA「タイトル未定」</p>
            <p>《Blu-ray収録内容》</p>
            <p>1. 既存ライブ曲</p>
            """,
            "html.parser",
        )
        with patch.object(SYNC, "get_soup", side_effect=[list_soup, detail_soup]):
            candidates, source = SYNC.discover_official_release_news(
                self.config,
                [],
            )
        self.assertEqual(source["status"], "healthy")
        self.assertEqual(candidates[0]["uncoveredTitles"], ["恋、はじめました。"])

        with patch.object(SYNC, "get_soup", side_effect=[list_soup, detail_soup]):
            candidates, _ = SYNC.discover_official_release_news(
                self.config,
                [
                    {
                        "title": {"ja": "恋、はじめました。"},
                        "releaseDate": "2026-08-26",
                    },
                ],
            )
        self.assertEqual(candidates, [])

    def test_release_news_uses_quoted_headline_titles_for_streaming_releases(
        self,
    ) -> None:
        list_soup = SYNC.BeautifulSoup(
            """
            <a href="/news/detail/3477">
              リリース 2026.04.02
              ≒JOY『「僕たちの歌」「ノンフィクション」配信リリース決定！
            </a>
            """,
            "html.parser",
        )
        detail_soup = SYNC.BeautifulSoup(
            "<p>各配信サービスで配信します。</p>",
            "html.parser",
        )
        existing = [
            {"title": {"ja": "僕たちの歌"}, "releaseDate": "2026-04-02"},
            {"title": {"ja": "ノンフィクション"}, "releaseDate": "2026-04-02"},
        ]
        with patch.object(SYNC, "get_soup", side_effect=[list_soup, detail_soup]):
            candidates, source = SYNC.discover_official_release_news(
                self.config,
                existing,
            )
        self.assertEqual(source["status"], "healthy")
        self.assertEqual(candidates, [])

    def test_release_news_recognizes_a_configured_primary_campaign_date(self) -> None:
        config = SYNC.build_equal_love_config()
        list_soup = SYNC.BeautifulSoup(
            """
            <a href="/news/detail/11588">
              リリース 2026.06.16
              =LOVE 21stシングル、2026年8月26日(水)に発売決定！
            </a>
            """,
            "html.parser",
        )
        detail_soup = SYNC.BeautifulSoup(
            "<p>=LOVE 21stシングルは2026年8月26日(水)発売です。</p>",
            "html.parser",
        )
        with patch.object(SYNC, "get_soup", side_effect=[list_soup, detail_soup]):
            candidates, source = SYNC.discover_official_release_news(
                config,
                [
                    {
                        "title": {"ja": "恋、はじめました。"},
                        "releaseDate": "2026-08-04",
                    },
                ],
            )

        self.assertEqual(candidates, [])
        self.assertEqual(source["status"], "healthy")

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
            "sourceNote": "official announcement",
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
            "sourceNote": "official announcement",
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
            "sourceNote": "official announcement",
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

    def test_announcement_without_credits_stays_byte_stable_on_release_day(self) -> None:
        existing = {
            "id": "released-song",
            "releaseDate": "2099-01-01",
            "sourceStatus": "announced",
            "sourceNote": "official announcement",
            "tags": ["announced", "single"],
        }

        merged = SYNC.merge_existing_song_update(
            existing,
            {},
            today=date(2099, 1, 1),
        )

        self.assertEqual(merged, existing)

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
            "sourceNote": "official announcement",
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

    def test_earliest_commercial_release_is_input_order_invariant(self) -> None:
        early = {
            **self.official_song,
            "releaseTitle": {"ja": "Digital - Single", "romaji": "Digital"},
            "releaseType": "digital",
            "releaseDate": "2019-08-04",
            "trackNo": 1,
            "trackType": "title",
            "coverSourceUrl": "https://is1-ssl.mzstatic.com/image/thumb/early.jpg",
            "officialUrl": "https://music.apple.com/jp/album/example/1",
        }
        late = {
            **early,
            "releaseTitle": {"ja": "Later Album", "romaji": "Later Album"},
            "releaseType": "album",
            "releaseDate": "2021-04-07",
            "trackNo": 9,
            "trackType": "album",
            "coverSourceUrl": "https://s3-aop.plusmember.jp/later.jpeg",
            "officialUrl": "https://not-equal-me.jp/discography/detail/4/",
        }

        def select(candidates: list[dict]) -> dict:
            selected = None
            for candidate in candidates:
                if SYNC.should_prefer_release(candidate, selected):
                    selected = candidate
            return selected

        self.assertEqual(select([early, late]), early)
        self.assertEqual(select([late, early]), early)
        self.assertFalse(SYNC.should_prefer_release(late, early))

    def test_same_day_release_selection_is_deterministic(self) -> None:
        type_c = {
            **self.official_song,
            "releaseTitle": {"ja": "Single[CD+DVD/Type-C]", "romaji": "C"},
        }
        type_d = {
            **self.official_song,
            "releaseTitle": {"ja": "Single[CD+DVD/Type-D]", "romaji": "D"},
        }
        self.assertTrue(SYNC.should_prefer_release(type_c, type_d))
        self.assertFalse(SYNC.should_prefer_release(type_d, type_c))

    def test_same_day_curated_provenance_requires_an_exact_rediscovery(self) -> None:
        override = {
            "releaseId": "2099-01-01-shinkyoku-single",
            "releaseTitle": "新曲シングル",
            "releaseType": "single",
            "releaseDate": "2099-01-01",
            "trackNo": 1,
            "trackType": "title",
            "coverUrl": "/covers/equal-love/shinkyoku.jpg",
            "coverSourceUrl": "https://equal-love.jp/example-cover.jpg",
            "officialUrl": "https://equal-love.jp/discography/detail/999/",
        }
        config = SYNC.ProjectConfig(
            project_id="equal-love",
            official_base="https://equal-love.jp",
            group_artist="=LOVE",
            utanet_artist_id="1",
            utanet_artist_path="/artist/1/",
            sister_group_markers=("≠ME", "≒JOY"),
            release_provenance_overrides={"新曲": override},
        )
        rediscovered = {
            **self.official_song,
            "coverSourceUrl": override["coverSourceUrl"],
            "officialUrl": override["officialUrl"],
        }
        songs = {SYNC.title_key("新曲", config): rediscovered}

        SYNC.apply_release_provenance_overrides(config, songs)
        self.assertEqual(
            songs[SYNC.title_key("新曲", config)]["releaseId"],
            override["releaseId"],
        )

        conflicting = {
            SYNC.title_key("新曲", config): {
                **rediscovered,
                "trackNo": 2,
            },
        }
        with self.assertRaisesRegex(RuntimeError, "Same-day commercial release conflict"):
            SYNC.apply_release_provenance_overrides(config, conflicting)

    def test_release_campaign_uses_advance_until_primary_release_date(self) -> None:
        config = SYNC.build_equal_love_config()
        transition = config.release_campaign_transitions["恋、はじめました。"]
        existing_song = {
            "id": "koi-hajimemashita",
            "title": {"ja": "恋、はじめました。", "romaji": "Koi, Hajimemashita."},
            "artist": {"ja": "=LOVE", "romaji": "Equal Love"},
            "releaseTitle": {"ja": "恋、はじめました。[CD+Blu-ray/Type A]"},
            "releaseType": "single",
            "releaseDate": "2026-08-26",
            "trackNo": 1,
            "trackType": "title",
            "coverUrl": "/covers/equal-love/koi-hajimemashita.jpg",
            "coverSourceUrl": "https://equal-love.jp/later.jpg",
            "officialUrl": "https://equal-love.jp/news/detail/11815",
            "creditSourceUrl": "https://www.uta-net.com/song/397245/",
            "ownershipEvidence": "verified-credits",
            "credits": {
                "lyricist": {"ja": "指原莉乃", "romaji": "Sashihara Rino"},
                "composer": {"ja": "小池竜暉", "romaji": "Koike Ryuki"},
                "arranger": {"ja": "めんま", "romaji": "Menma"},
            },
        }
        official_songs: dict[str, dict] = {}
        key = SYNC.title_key("恋、はじめました。", config)

        SYNC.apply_release_campaign_transitions(
            config,
            official_songs,
            {key: existing_song},
            today=date(2026, 8, 14),
        )

        self.assertEqual(official_songs[key]["releaseDate"], "2026-08-04")
        self.assertEqual(official_songs[key]["releaseType"], "digital")
        self.assertEqual(
            official_songs[key]["officialUrl"],
            transition["advanceRelease"]["officialUrl"],
        )
        self.assertEqual(
            SYNC.resolve_new_song_ownership(
                config,
                official_songs[key],
                None,
                key=key,
                committed_by_key={},
                known_other_project_title_keys=set(),
                existing_by_key={key: existing_song},
            ),
            ("ACCEPT", "verified-credits"),
        )

        advance_song = SYNC.replace_release_provenance_bundle(
            existing_song,
            official_songs[key],
        )
        future_official_songs: dict[str, dict] = {}
        SYNC.apply_release_campaign_transitions(
            config,
            future_official_songs,
            {key: advance_song},
            today=date(2026, 8, 26),
        )
        primary_song = SYNC.merge_existing_song_update(
            advance_song,
            future_official_songs[key],
        )
        self.assertEqual(primary_song["releaseDate"], "2026-08-26")
        self.assertEqual(primary_song["releaseType"], "single")
        self.assertEqual(
            primary_song["officialUrl"],
            transition["primaryRelease"]["officialUrl"],
        )

    def test_earlier_commercial_provenance_replaces_the_whole_bundle(self) -> None:
        existing = {
            "id": "not-equal-me",
            "title": {"ja": "≠ME", "romaji": "Not Equal Me"},
            "artist": {"ja": "≠ME", "romaji": "Not Equal Me"},
            "releaseId": "2021-later-album",
            "releaseTitle": {"ja": "Later Album", "romaji": "Later Album"},
            "releaseType": "album",
            "releaseDate": "2021-04-07",
            "trackNo": 9,
            "trackType": "album",
            "coverUrl": "/covers/not-equal-me/not-equal-me.jpg",
            "coverSourceUrl": "https://s3-aop.plusmember.jp/later.jpeg",
            "officialUrl": "https://not-equal-me.jp/discography/detail/4/",
            "memberIds": ["member"],
            "tags": ["2021", "album", "manual-tag"],
            "credits": {"lyricist": {"ja": "credit", "romaji": "Credit"}},
        }
        candidate = {
            "title": existing["title"],
            "releaseId": "2019-08-04-not-equal-me-single",
            "releaseTitle": {"ja": "≠ME - Single", "romaji": "Not Equal Me Single"},
            "releaseType": "digital",
            "releaseDate": "2019-08-04",
            "trackNo": 1,
            "trackType": "title",
            "coverUrl": existing["coverUrl"],
            "coverSourceUrl": "https://is1-ssl.mzstatic.com/image/thumb/early.jpg",
            "officialUrl": "https://music.apple.com/jp/album/me-single/1",
        }

        merged = SYNC.apply_earlier_release_provenance(existing, candidate)

        for field in SYNC.RELEASE_PROVENANCE_FIELDS:
            self.assertEqual(merged[field], candidate[field])
        self.assertEqual(merged["memberIds"], existing["memberIds"])
        self.assertEqual(merged["credits"], existing["credits"])
        self.assertEqual(merged["tags"], ["2019", "digital", "manual-tag", "title"])

    def test_incomplete_earlier_provenance_fails_closed(self) -> None:
        existing = {
            "id": "stable",
            "title": {"ja": "Song"},
            "releaseDate": "2021-01-01",
        }
        with self.assertRaisesRegex(RuntimeError, "incomplete"):
            SYNC.apply_earlier_release_provenance(
                existing,
                {"title": {"ja": "Song"}, "releaseDate": "2020-01-01"},
            )

    def test_performance_only_dates_are_not_commercial_overrides(self) -> None:
        not_equal_overrides = SYNC.build_not_equal_me_config().release_provenance_overrides
        equal_config = SYNC.build_equal_love_config()
        nearly_config = SYNC.build_nearly_equal_joy_config()
        equal_overrides = equal_config.release_provenance_overrides
        equal_campaigns = equal_config.release_campaign_transitions
        nearly_campaigns = nearly_config.release_campaign_transitions
        self.assertNotIn("クルクルかき氷", not_equal_overrides)
        self.assertNotIn("866", equal_overrides)
        self.assertEqual(
            equal_campaigns["恋、はじめました。"]["advanceRelease"]["releaseDate"],
            "2026-08-04",
        )
        self.assertEqual(
            equal_campaigns["恋、はじめました。"]["primaryRelease"]["releaseDate"],
            "2026-08-26",
        )
        self.assertEqual(
            nearly_campaigns["サマーツインテール"]["advanceRelease"]["releaseDate"],
            "2026-07-09",
        )
        self.assertEqual(
            nearly_campaigns["サマーツインテール"]["primaryRelease"]["releaseDate"],
            "2026-08-05",
        )

        not_equal_songs = json.loads(
            SYNC.build_not_equal_me_config().songs_path.read_text(encoding="utf-8"),
        )
        equal_songs = json.loads(
            SYNC.build_equal_love_config().songs_path.read_text(encoding="utf-8"),
        )
        nearly_songs = json.loads(
            SYNC.build_nearly_equal_joy_config().songs_path.read_text(encoding="utf-8"),
        )
        self.assertEqual(
            next(song for song in not_equal_songs if song["id"] == "kurukuru-kaki-koori")["releaseDate"],
            "2021-04-07",
        )
        self.assertEqual(
            next(song for song in equal_songs if song["id"] == "866")["releaseDate"],
            "2021-05-12",
        )
        koi = next(song for song in equal_songs if song["id"] == "koi-hajimemashita")
        summer_twintail = next(
            song for song in nearly_songs if song["id"] == "samaatsuinteeru"
        )

        def published_bundle(song: dict) -> dict:
            bundle = {
                field: song[field]
                for field in SYNC.RELEASE_PROVENANCE_FIELDS
            }
            bundle["releaseTitle"] = song["releaseTitle"]["ja"]
            return bundle

        self.assertEqual(
            published_bundle(koi),
            SYNC.select_release_campaign_bundle(
                equal_campaigns["恋、はじめました。"],
                SYNC.current_catalog_date(),
            ),
        )
        self.assertNotEqual(koi.get("sourceStatus"), "announced")
        self.assertNotIn("announced", koi["tags"])
        self.assertEqual(
            published_bundle(summer_twintail),
            SYNC.select_release_campaign_bundle(
                nearly_campaigns["サマーツインテール"],
                SYNC.current_catalog_date(),
            ),
        )

    def test_review_candidates_take_precedence_over_publishable_changes(self) -> None:
        self.assertEqual(
            SYNC.determine_sync_report_outcome(
                True,
                [{"candidateKey": "needs-review"}],
            ),
            ("review-required", "review"),
        )
        self.assertEqual(
            SYNC.determine_sync_report_outcome(True, []),
            ("publishable-change", "publish"),
        )
        self.assertEqual(
            SYNC.determine_sync_report_outcome(False, []),
            ("no-change", "none"),
        )

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
            current_release_urls={song["officialUrl"] for song in committed[:12]},
        )

    def test_catalog_coverage_ignores_releases_outside_the_rolling_index(self) -> None:
        currently_listed = [
            {
                "title": {"ja": f"既存曲{index}"},
                "officialUrl": f"https://equal-love.jp/discography/detail/{index}/",
            }
            for index in range(15)
        ]
        retired_release = [
            {
                "title": {"ja": f"旧盤曲{index}"},
                "officialUrl": "https://equal-love.jp/discography/detail/999/",
            }
            for index in range(3)
        ]
        committed = [*currently_listed, *retired_release]
        discovered = {
            SYNC.title_key(song["title"]["ja"], self.config): song
            for song in currently_listed
        }

        SYNC.validate_official_catalog_coverage(
            self.config,
            discovered,
            committed,
            current_release_urls={song["officialUrl"] for song in currently_listed},
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
                current_release_urls={song["officialUrl"] for song in committed},
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
