# Android listening insights (draft)

Imported Google Takeout watch activity and Musike playback sessions are stored in a separate IndexedDB database. Musike backups made on Android include these records. Restore merges listening records even if the library restore is set to replace; a session with an identical ID is never replaced by a shorter version. Older backups with no listening data remain valid. The Takeout JSON file must be extracted before selection and must be no larger than 100 MB. Takeout records can include YouTube videos that are not music; the mix uses only records explicitly tagged as YouTube Music, plus Musike playback sessions.

Listening time is measured from forward media-position progress while playback is reported as playing, capped at elapsed wall time. Seeks reset the measurement baseline. A play is counted after 30 seconds of measured listening, or half the track duration if shorter than 60 seconds. A replay creates a new session. Playback measurement depends on WebView media events; background throttling, process death, buffering, and abrupt shutdown may cause undercounting. Real Android testing is required. Takeout records do not provide verified listening durations and are never added to listening hours. A matching Takeout event and Musike session cannot reliably be matched, so imported and local counts remain separate and may overlap.

## Unfinished work

Native Google account authorization, YouTube playlist sync, and full Android lifecycle and playback testing remain outstanding. The mix is generated from available listening data when the settings view opens; saving creates a local snapshot. Imported data is not synced across devices, and its availability depends on WebView storage and backups. Google Takeout activity can be incomplete, and its JSON format, language, and available metadata vary.

The existing Android player resolves YouTube streams and provides background audio. YouTube's current API developer policies restrict separating audio from video and background playback for API clients. This existing architecture presents a potential policy and distribution blocker if official YouTube API access is added. Review it before enabling that integration or claiming Play Store readiness. See https://developers.google.com/youtube/terms/developer-policies.

## Android build

Install JDK 21, Node and pnpm, and the Android SDK; set `ANDROID_HOME` or `mobile/android/local.properties`. Run `pnpm install --frozen-lockfile` and `pnpm --filter @musike/mobile apk`. The repository's existing `mobile/android/keystore.properties` or `MUSIKE_KEYSTORE*` environment variables configure release signing; otherwise the release APK is unsigned. Test on a device with the release signing identity before distributing. Never commit keystore passwords or private keys.
