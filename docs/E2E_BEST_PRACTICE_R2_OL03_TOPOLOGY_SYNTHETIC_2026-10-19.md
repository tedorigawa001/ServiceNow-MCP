# BP-5 R-2 OL-03：祖先/path再照合の内部契約・合成検証

Date: 2026-10-19（実装開始）/ 最終確認: 2026-10-20 / Status: 合成検証のみ。実opener/OS topology source未接続。permitなし。

## 1. 範囲

[FD移譲設計draft-0.4 §14](BEST_PRACTICE_BP5_R2_OL03_SECURE_FD_TRANSFER_DESIGN.md)に対応する。
privateなTopologyReceipt/TopologySource、保持祖先の再観測、固定anchorから全component/leafへの再walkを追加した。
実FD・filesystem・API・PDI・実署名は扱わず、telemetry調査は保留。token発行・設定変更・permit発行・Pushは行わない。

## 2. 実装

- receiptはlineage/record/target比較値と祖先origin/snapshotに結合。合成fixtureでopen時に作成し、実record producerは追加しない。
- 新しいreview_topology_targetは移譲後・M0前とB完了後・M4前の2回、全保持祖先＋全namespaceを照合する。旧OpenBoundComparisonの意味/経路は変更しない。
- 祖先はdirectory専用の型/shapeで比較し、leafのsize/links条件と区別。inodeだけでなくStat全field・ACL/FS・可視名の分類を照合。別deviceのsystem祖先も自身の初期値と比較する。
- 読み直したnamespace leafは元のopen snapshotへ結合し、同hashでも別inodeは拒否。一時resourceはbytes/hash/parserへ渡さない。
- SharedBudgetへ合成topology単発呼出しの16384上限を追加。元10秒/cancel/sticky failureを全境界前後で確認し、metadata100/名前640KiB/payload2GiB/EINTR8枠は変更しない。
- 名前は固定enumだけを受け取り、raw名の無制限allocationはこの契約にはない。OS側bounded列挙/copy計上やAPFS/ownership/noexec取得は別工程。
- 一時current/next最大2個、保持祖先＋leaf＋一時2の構造上限132。合成Drop追跡はclose成功や実FD予約の証拠ではない。
- B後失敗で解析結果を破棄しM4は取得しない。初回失敗ではM0/payload0。結果のDebugは固定で、非Clone/非serialize、entitlement gateは停止。

## 3. 追加13テスト

| テスト群 | 確認したこと |
|---|---|
| 正常経路 | 全edgeを2回walk、正常28契約呼出し。2回目はA/B全bytes読取後かつM4前、M0〜M4各1回。temporary最大2、全所有resource解放 |
| 保持祖先の変更 | 移譲後の全4祖先、走査後の全4祖先の変更で停止。初回失敗はpayload0 |
| namespaceの変更 | anchor/途中parent/leafの全5位置。同hashの別leaf、古い保持chainは不変でも拒否 |
| B後の差替え | 全5位置で保留結果を捨て、M4なし |
| metadataの完全一致 | dev/ino/type/UID/GID/mode/nlink/size/mtime sec/ns/ctime sec/nsの12差分 |
| 取得失敗matrix | 1〜28各境界でMetadataUnavailable、retryなし、後続phaseなし、late resourceも解放 |
| receipt/所有権の混入 | 別lineage/世代/policy/祖先数/originを取得前に拒否 |
| policy/不明 | ACL present/unknown、可視名disallowed/unknown、FS unknown、symlink、許可名の追加、前後Stat差を拒否 |
| 共通上限 | 2回目で16384枠が尽きてもresetしない。既存failureなら0呼出し |
| 期限/取消matrix | 1〜28各境界の遅延成功を含む期限切れ・取消で停止。枠/temporary/leaf/祖先を解放 |
| unwind | namespace途中でpanicしても所有resourceを一度ずつ解放。運用panic回復を主張しない |

## 4. 検証と途中の結果

実行コマンド（すべてローカル/offline、実metadata sourceは実行しない）:

```sh
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo rustfmt --edition 2024 --check native/r2-outer/tests/fixtures/exec_probe.rs
bdo git -c core.fsmonitor=false diff --check
```

- 新規13テスト、全体407件（5 suites）が成功。release build成功。
- 初回Clippyは合成sourceのnested if 2箇所をcollapsible_ifで拒否。条件を変えずlet-chainへ整理した後は成功。
- 比較の感度確認として、anchor snapshot比較を一時的に無効化するとnamespace差替えテストが失敗（不正な成功値を検出）。比較を復元して全体を再実行した。一時変更は残していない。
- 最終のcargo fmt/fixture rustfmt、5文書のlocal link/コードフェンス/行末空白、git diff --checkは成功。

## 5. 未接続・未証明

実trusted openerからのsnapshot生成、実directory FD/flags/metadata/xattr可視性、祖先profileの承認、OS syscall/名前copy/FD予約/解放枠、process全体FD数、record exact bytes/identity/世代/期限の再読、lease、hard timeoutは未対応。
合成sourceは協調的な比較契約であり、悪意あるsourceの観測偽造や隠れた再試行・ABA・検査後変更を防ぐ証明ではない。
通常v2入口Unavailable、APPROVED_REGISTRY=None、runtime gate92、DER/absence停止・既存JSON/exit codeを維持する。
