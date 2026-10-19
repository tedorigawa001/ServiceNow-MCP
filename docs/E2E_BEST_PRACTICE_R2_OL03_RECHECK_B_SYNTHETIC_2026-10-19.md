# BP-5 R-2 OL-03：B再走査・全体hash/range再照合の合成検証

Date: 2026-10-19 / Scope: private合成sourceのA/B bytes照合。実FD・metadata・Security APIへの接続なし。

## 1. 実装範囲と停止境界

[保持FD/parser接続設計draft-0.4](BEST_PRACTICE_BP5_R2_OL03_HELD_FD_PARSER_DESIGN.md)§14を実装した。
同じReadScopeの`recheck_b`がCapturedAを消費し、B全体走査のhashと、hashへ渡した同じblockのA採取rangeを再照合する。
全体hash BはAで期待値と一致済みのhashと比較し、Bに別の期待値や新しい開始時刻を渡す口は作らない。

- scopeごとのprivate `Rc<()>`識別子をAと結び、Bでは同一性とN/range整合を検査。別scope/source・新台帳へ移したAは読取前にSourceMismatch。
- 64KiB以下の単一stream bufferで0〜Nを走査し、header/commands・signatureとの交差をbyte完全一致で比較する。A採取とB比較の交差計算を共通化。
- header/signature差はSourceMismatchで早期停止。range外の本文差は最終HashMismatch。早期拒否したB hashを完成済みと報告しない。
- 全照合量・NでEOF0bytes・最終checkpointまで成功した場合だけ、Aのbufferを所有した`ComparedAB(bytes_only_pending_metadata_not_execution_authority)`を返す。
- Bの大容量blob複製なし。正常実bytesは`32 + header全長 + 2*N`、EOF0bytes/EINTRは0課金。A/Bで同じ予約・使用量・要求回数・再試行枠・元10秒/cancel/clockを使う。
- 元の最初の失敗をラッチし、B失敗後もread/次scopeへ進めない。Aは所有権移動で消費し、失敗時のbufferはRust所有権で破棄する。
- ComparedABのDebugは固定表記、非Clone・非serialize。entitlement gateは引き続き必ず失敗し、DER/absence/XML意味解析へ昇格しない。

scope識別子は同じRust source objectを使うための管理用tokenで、OS FD/承認recordの証拠ではない。
metadata/祖先/path/record/lease・OS pread adapterは未接続。Bの既読位置への後発変更やABAを完全検出したとはしない。
本番registry未設定、通常v2入口Unavailable、runtime gate92、permitなしを維持。telemetry調査は保留。
API実接続・実機/PDI操作・token発行・設定変更は行っていない。

## 2. 追加26テスト

| 群 | 確認した境界 |
|---|---|
| 正常/容量 | A/B hash/range一致、正確な重複課金、64KiBを跨ぐrange、header上限、5MiB署名、同じA bufferの所有権移動（pointer不変） |
| 改変 | A後のheader/command/署名差、range外本文差、Bの未読部分の途中変更、A cursor後の変更をBが検出するケース |
| 独立range比較 | 実file bytes/hashは不変のまま、privateな合成A bufferだけを変えてもrange差で拒否（本番に変更APIはない） |
| I/O | B短読取/切詰めで即停止、EOF時の追加1byte、AでEINTR8回消費した後のB停止、A/Bで同じoffset再試行と実bytes課金 |
| scope結合 | 同じbytesでも別scope/sourceのAを拒否、同じsourceを新台帳へ移しても拒否、合成capture extent不整合を読取前に拒否 |
| 共有上限 | Aで消費済みの要求回数・残予約の枯渇、元台帳の既存読取量を保持、Dropで未消費予約だけ解放 |
| 期限/取消 | B開始時、各block/EOFの遅延成功、hash/range比較checkpoint、EOF0応答後の最終checkpointの期限を拒否。各block/EOFで取消をラッチ |
| 非authority | DER/absence/XML gate維持、固定Debug。B cursor後の変更を検出できない場合も「metadata待ち」の診断にとどめる |
| 純粋helper | rangeの部分交差/空交差・byte差・checked overflow |

既存273件＋新規26件＝299件（5 suites）。A25件・読取境界27件・parser33件と、通常入口/gate92・旧0.1 offlineの回帰を維持する。
source/clock/counterは合成。2GiB実読取・32768回OS syscall・実FD解放・root配備を試験したものではない。
pointer不変の試験はBがAのVecを保持することだけを確認し、process全体RSSやallocatorの全割当を測ったものではない。

## 3. 途中の失敗と検証

初回A/B関連51件実行は50成功/1失敗。署名変更fixtureがBで既読のoffset131069を遅いcall9で書き換えており、未読部分の変更を試す意図と合っていなかった。
単独再実行でも同じ結果を確認。変更対象をまだ読まれていないoffset131080へ移し、元byteが変更値と違うこともassertしてfixtureを修正した。
製品の拒否条件は緩めていない。既読位置の変更を検出できない限界は別テストで意図的に維持した。
Clippyは交差計算の戻り型にtype_complexityを検出したため、同じ型のaliasへ整理。A/B関連51件とClippyの再実行は成功。

```text
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo rustfmt --edition 2024 --check native/r2-outer/tests/fixtures/exec_probe.rs
bdo git -c core.fsmonitor=false diff --check
```

最終結果：全体299件成功（5 suites）、release build成功、Clippy指摘なし、cargo fmt・fixture rustfmt・diff検査成功。
関連7文書のlocal link・code fence・行末空白検査も成功。依存/Cargo.lock変更なし。
TypeScript/MCP E2E・実署名・OS適合試験は対象外。

## 4. 残る限界

A/B各走査はatomicなfile snapshotではない。更新排他・metadata/record/祖先/pathの前後照合なしには、同じ実体の不変性を主張しない。
実deployment/nativeの読取は新しい共有台帳に未接続で、運用の全工程で共有上限が実施済みという意味ではない。
ComparedABからFD検証済み/署名validity/permitへ進む経路は追加していない。DER/absence・実API・本番policyの停止は引き続き維持する。
