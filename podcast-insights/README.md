# Podcast Insights

Approved scope: [proposal #158](https://github.com/makecindy/cindy-official-plugins/issues/158#issuecomment-6120456702). M1 imports and original-evidence workflows plus optional M2 AssemblyAI cloud transcription. In-app playback is deferred to M3.

Open the sidebar library, import RSS / Apple Podcasts / Xiaoyuzhou or public audio links, then search or read the available transcript. Link import in the page creates a visible Cindy task; match RSS candidates and confirm cloud fees in its cards. Tools expose eight stable `podcast_*` names. The optional key is stored only by Cindy; Agent arguments cannot submit paid transcription.

Build: `node podcast-insights/build.mjs`. Tests: `node --test .tests/podcast-insights.test.mjs`. Requires stable/Beta Cindy >=0.1.103. Metadata locales cover en/zh-CN/ja/ko; runtime pages support Chinese and English with English fallback.

SQLite migrations retain legacy0.1.x JSON, receipts, briefs and export files. Legacy active transcript versions and pending cloud jobs are imported using stable IDs. Deletes affect the new index and create a backup; originals and exports are retained. Uninstall retains the library.

Declared differences from the approved draft: preserve the existing `assemblyai_key` secret name because the Host does not expose a sanctioned plaintext migration path; never ask existing users to reconfigure it. Host secret status may supply a masked tail; show it only when present, never read the key. Page imports/cloud estimates create ordinary visible tasks (`agent.tasks`), with no background Agent permission. Unknown-job list recovery examines100 recent provider tasks and fails closed if ambiguous. Harmless DOCTYPE is removed; declared entities are rejected to prevent entity expansion.

Content permissions are separate from API access and user confirmation. Provider retention/training settings and the actual model data flow need verification before public release; local library storage does not imply local-only analysis. Review the release evidence before marking device verification complete.
