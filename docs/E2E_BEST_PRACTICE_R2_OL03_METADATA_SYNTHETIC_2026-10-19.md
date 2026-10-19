# BP-5 R-2 OL-03：M0〜M4 metadata内部契約・合成source検証

Date: 2026-10-19 / Scope: private typed観測契約と合成source。実FD/stat/ACL/xattr/Security API接続なし。

## 1. 実装範囲

[保持FD/parser接続設計draft-0.5](BEST_PRACTICE_BP5_R2_OL03_HELD_FD_PARSER_DESIGN.md)§15を実装した。
`positioned_read/metadata.rs`のMetadataSourceが、同じbytes source objectからphaseごとのtyped観測を返す。
M0（bytes前）→M1（preflight後）→M2（A後/parser前）→M3（parser後/B前）→M4（B後）の順序を内部Flowで固定する。

- Statはdev/ino、型、UID/GID、permission/special bits、link数、size、mtime/ctime秒・ns。before/afterの全field一致を要求し、atimeは扱わない。
- M0はregular・UID0・mode0555・単一link・Local・入力期待device/Nを検査し、immutableなbaselineへ正規化する。期待値をsourceから学習しない。
- M1〜M4はbaselineとexact比較。hashが同じでも、GID/time/ACL/xattr名などの差で停止する。
- ACL Present/Unknown、FS NonLocal/Unknown、xattr列挙NoneをAbsent/Empty/Localへ変換しない。取得失敗は全phaseでMetadataUnavailable。
- xattr照会長/返却量64KiB上限、長さ差はChanged。空または`com.apple.provenance\0`だけを受理し、重複/未知名/quarantine/ResourceFork/不正終端を拒否。値は扱わない。
- source取得前後・正規化/比較後・最終返却前も共有10秒/cancelを確認。遅い成功やエラーを破棄し、最初の失敗を台帳にラッチする。
- A/Bのbytes課金・読取回数・予約/EINTR枠は同じまま。metadataは最大5観測、名前bytesはmetadata専用上限で、file payloadの課金を増やす読取はしない。
- 成功はprivateな`ComparedM0M4(source_only_pending_path_record_lease_not_execution_authority)`のみ。非Clone・非serialize・固定Debug、entitlement gateも常に拒否する。
- bytes-only経路は引き続き非authorityで、metadata完了型への変換constructorを作らない。新規Metadata/MetadataUnavailableは内部理由で、公開JSON/exit code変更なし。

FileTypeとmodeを分離した内部型であり、OS raw st_modeのABIやchecked decodeを試験したものではない。
観測の取得順・同じ実FD・UID0の真正性・期待device/Nのroot承認由来は未証明。合成値を実OSの証拠にしない。
sourceが既に確保したraw namesを受けるため、OS adapterの確保前上限・各syscall内の共有checkpointは別実装が必要。

通常v2入口Unavailable、本番registry未設定、runtime gate92、DER/absence/API/permitへの停止を維持。
telemetry調査は保留。実機/PDI操作・token発行・設定変更は行っていない。

## 2. 追加29テスト

| 群 | 確認内容 |
|---|---|
| 正常/順序 | M0〜M4とA/B bytesの正確なevent順、課金・残予約、許可provenance/GID保持、固定Debug |
| M0 policy | owner/mode/特殊bit/type/link/size/device/ACL/FS不適合をbytes0回で拒否。Unknown/Noneのcoercionなし |
| typed形状 | ns範囲外、modeへの型bits混入、未知型・symlink/other、xattr照会/返却長差・64KiB上限、不正/重複/未知名 |
| 前後race | 各phaseでbefore/after stat差を拒否。file bytes不変でもstat差で拒否 |
| phase間差 | M1〜M4でdev/ino/type/UID/GID/mode/link/size/mtime/ctime/ACL/FS/xattr名の各変更を拒否。許可名の追加・削除も対象 |
| 取得失敗 | M0〜M4の各取得失敗で即停止し、再試行/fallback/後続phaseなし |
| A/B連携 | preflight後・A既読位置・B既読位置の変更をctime差で検出。M2がparser前、M3がB前、M4が結果返却前にあることを確認 |
| ラッチ | M4失敗後のread/metadata再実行/次scopeを拒否。phase飛越・重複・順序違い、期待deviceを観測値で更新しない |
| 期限/取消 | 各metadata取得の遅延成功/エラー・取消を拒否。開始前source0回、M4比較後の最終期限/取消、時計巻戻し/取消解除後もラッチ継続 |
| 非authority | DER/absence/XML gate維持、未知属性のsecret markerを理由へ出さない。先行bytes課金/開始時刻は維持 |

既存299件＋追加29件＝328件（5 suites）。旧0.1 offline・通常入口/gate92・A/B/parser/読取境界の回帰も維持。
合成sourceはmemory内の架空file bytesとmetadataを返すだけで、root所有file作成・chown・ACL/xattr設定・OS syscallは使わない。
phase間差は複数field×phaseを同じテスト内で列挙し、各変化を独立に拒否することを確認した。

## 3. 検証と経過

初回のmetadata関連試験と既存A/B試験は成功。ClippyでMetadataSourceの可視性が利用箇所より狭いprivate_boundsを検出した。
契約型の可視性をprivateなsignature_boundary内に揃え、外部APIには公開せず再実行した。判定条件や停止を緩めるlint抑制は追加しない。
その後provenance削除・M0前の停止・M4比較後の取消を追加し、全体328件成功を確認した。

```text
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo rustfmt --edition 2024 --check native/r2-outer/tests/fixtures/exec_probe.rs
bdo git -c core.fsmonitor=false diff --check
```

最終結果：328件成功（5 suites）、release build成功、Clippy指摘なし、cargo fmt・fixture rustfmt・diff検査成功。
関連7文書のlocal link・code fence・行末空白検査も成功。依存/Cargo.lock変更なし。TypeScript/MCP E2Eは対象外。

## 4. 未対応・限界

OS stat/ACL/xattrの同一FD取得、信頼済みopener、祖先/path/record/lease照合は未接続。
sourceの虚偽/不完全な観測や変更後復元ABAを完全排除したとはしない。provenance値やOSの実行時状態も未確認。
実deployment/nativeの読取は新台帳に未接続であり、全運用工程の上限実施や信頼済み配備を証明しない。
本結果を署名validity・DER/absence・permitへ変換する経路は追加していない。実API・本番policy・実機の承認/設定は保留のまま。
