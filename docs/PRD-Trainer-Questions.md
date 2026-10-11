# Trainer Guide: Discussion Questions on the Music Player PRD

For use with trainees who have read [PRD.md](PRD.md). Each section has questions and a short **trainer note** with what a good answer covers. Questions go from basic to advanced; pick what suits the group.

**Suggested format:** 60–90 minutes. Give trainees 15 minutes to read the PRD, then discuss one section at a time.

---

## 1. What is a PRD and why write one?

1. In your own words, what problem does a PRD solve? What would happen if we started coding straight away?
2. Who reads a PRD? Name three roles and what each wants from it.
3. Why did we write the PRD *before* asking Claude to write any code?
4. What is the difference between a *goal* and a *non-goal*? Pick two non-goals from §1.2 and say why listing them helps.

> **Trainer note:** Look for: shared understanding, cheaper to change a document than code, a reference for testing and review. Non-goals prevent scope creep and set expectations.

## 2. Turning an idea into requirements

5. The original request said "4 use cases" but listed 5. What would have happened if nobody noticed?
6. Look at UC1-6: "Adding an already-present song is a no-op, not an error." Why is that one sentence valuable? What would a developer do without it?
7. Pick a vague requirement you might write ("the player should be fast"). Rewrite it so it can be tested. Compare with the Performance row in §4.
8. Why does each requirement have an ID (UC2-5, etc.)? Where else in the PRD are those IDs useful?
9. UC2-5 says Previous restarts the song if more than 3 seconds have played. Why is this level of detail important?

> **Trainer note:** Good requirements are specific, testable and unambiguous. IDs create traceability from requirement → API → test case.

## 3. Asking clarifying questions

10. What four questions did Claude ask before writing? Which one changed the data model the most?
11. The word "pool" was ambiguous. List two other things "pool" could have meant. How did the answer shape the database tables?
12. Why did Claude suggest a "recommended" option for each question? When would you disagree with a recommendation?
13. What questions would *you* have asked that were not asked? (e.g., Should songs be deletable from disk? Are there playlists limits?)
14. Is it better to ask many questions up front or fewer? What is the cost of each?

> **Trainer note:** Good questions are about decisions that are expensive to change later (data model, auth, scope), not about details a sensible default can cover. Compare with §1.4 Assumptions, the questions Claude chose *not* to ask but wrote down.

## 4. Assumptions and decisions

15. Open §1.3 and §1.4. What is the difference between a *decision* and an *assumption*?
16. Pick assumption 3 (removing a song from the collection removes it from playlists). Describe the alternative design. What changes in the API and in the UI?
17. Why is it better to write assumptions down instead of just building them?
18. Which assumption is riskiest if wrong? Why?

> **Trainer note:** Decisions are confirmed by the owner; assumptions are guesses that need review. The riskiest ones are those that are costly to reverse (e.g., hash-based dedupe, positions in playlists).

## 5. Designing for the future without building it

19. We were told "run locally now, scalable to the cloud later, but nothing in the cloud today". Look at §5.1. What is a *seam*? Give one example.
20. Why does the database store a `storage_key` instead of a file path?
21. Why use UUIDs instead of auto-increment IDs? What problem does it avoid when moving to the cloud?
22. The `owner_id` column is nullable and unused. Is that over-engineering? Defend both sides.
23. What is the danger of adding cloud code "just in case"?

> **Trainer note:** Seams are interfaces with one implementation today. The cost is small (a protocol and a class) and avoids a rewrite. YAGNI vs. cheap insurance: the line is whether the change is hard to make later (schema, public API) or easy (new adapter).

## 6. Architecture and modularity

24. Describe the rule "routers → services → repositories/storage". What goes wrong if a router queries the database directly?
25. Why is the audio engine a plain TypeScript class instead of code inside a React component?
26. Where would you add a new audio format? List the files you'd touch.
27. Draw the diagram in §5 from memory, then check it.
28. Why does the API have a `/v1` prefix from the start?

> **Trainer note:** Look for: testability, replaceability, single responsibility, ability to change one layer without touching others.

## 7. Data model and API

29. Explain the difference between `songs` and `collection_items`. Why aren't they one table?
30. Why does `playlist_songs` have `PRIMARY KEY (playlist_id, song_id)` *and* `UNIQUE (playlist_id, position)`? What bug does each prevent?
31. Why does `GET /songs` return an `in_collection` flag?
32. Why is reorder a single `PUT .../order` with the full list, and not "move item from A to B"?
33. Which status code would you return for a duplicate playlist name and why (409 vs 400 vs 422)?
34. Why does the streaming endpoint need to support `Range` requests?

> **Trainer note:** Q30: the primary key prevents duplicate songs, the unique position prevents two songs sharing a slot. Q32: full-list replace is idempotent and simpler to validate and test.

## 8. Testing strategy

35. Explain the difference between a unit test, integration test and E2E test using the music player as an example for each.
36. Why do integration tests use a real SQLite database and real files rather than mocks?
37. Look at B-UP-12 (DB insert fails after file write). What real-world failure is this simulating? Why is it a good test?
38. Why use Hypothesis (property tests) for playlist ordering (B-PS-09) instead of a few example cases?
39. Why is the frontend player logic tested with pure functions and a fake audio element?
40. Coverage gates say ≥ 90 % backend. Why does the PRD say "coverage is a floor; the case tables are the contract"?
41. Pick one feature and write three test cases not already listed. Which layer does each belong to?

> **Trainer note:** Test pyramid: many fast unit tests, fewer integration, very few E2E. Mocks hide integration bugs. 100 % coverage can still miss behaviors; named cases state intent.

## 9. Non-functional requirements

42. What are non-functional requirements? Name three from §4 and describe how you'd verify each.
43. Why is "Security: filename sanitized, files stored under generated keys" a *requirement* rather than an implementation detail?
44. What would "accessible" mean for a music player used without a mouse?

> **Trainer note:** NFRs are qualities (speed, security, accessibility) rather than features. They need measurable acceptance criteria.

## 10. Working with Claude Code

45. Compare these two prompts: "build a music player" vs. the one in Prompts.md Step 1. What's different? What did Claude have to guess in the first?
46. Why is "do not implement features yet" a useful sentence in a scaffolding prompt?
47. When a prompt says "cover test cases B-UP-01 to B-UP-20", what two benefits does that give you?
48. Claude wrote "use latest version at scaffold time" instead of version numbers. Why not just write the numbers?
49. Claude made assumptions and listed them rather than asking every question. How do you decide when an assistant should ask vs. assume?
50. How would you check that Claude's output actually matches the PRD? (Hint: Prompts.md Step 14.)

> **Trainer note:** Look for: specificity, constraints, traceability, evidence ("run tests and show me"), reviewing output rather than trusting it. Versions: Claude can't verify current numbers from memory, so it resolves them with the package manager.

## 11. Hands-on exercises

| # | Exercise | Time |
|---|---|---|
| A | **Add a feature to the PRD:** "Favorites". Write 5 requirements with IDs, update the data model and API table, and add 6 test cases. | 25 min |
| B | **Find the gaps:** exchange PRDs in pairs. Find 3 ambiguous requirements and rewrite them as testable. | 15 min |
| C | **Challenge an assumption:** choose an assumption from §1.4, reverse it, and list every section of the PRD that must change. | 15 min |
| D | **Prompt rewrite:** take a vague prompt ("make a playlist feature") and rewrite it using the Cheat Sheet in Prompts.md. | 10 min |
| E | **Missing question:** write three clarifying questions you would ask the product owner that the PRD doesn't answer. | 10 min |

## 12. Quick self-check (answers in the PRD)

| Question | Where to look |
|---|---|
| What happens when the same file is uploaded twice? | §1.4 (2), B-UP-11 |
| How many repeat modes and in what order? | UC2-3, F-PL-09 |
| What happens to a playlist when it's deleted? | UC3-4, B-PL-06 |
| What HTTP code for an out-of-range seek? | §7, B-ST-05 |
| Which layer may import FastAPI? | §5.3 |
| How would we move files to S3? | §5.1 |
