# BP-5 R-2 OL-03：expected child / seen照合の合成検証

Date: 2026-10-20 / Status: direct-child subsetの内部実装・合成検証。OS・実filesystem E2Eではない。

## 1. 対象と非対象

[設計draft-0.4 §13](BEST_PRACTICE_BP5_R2_OL03_BOUNDED_SCAN_COLLECTOR_DESIGN.md#13-expected-child--seen照合subset運用未接続)に対応する。[child_set.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/child_set.rs)を既存単発境界へ追加し、[children.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/tests/children.rs)で合成sourceを接続した。

全体受付・permit発行は無効、telemetry調査は保留。APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持する。今回OS接続・実機操作・token発行・設定変更・Pushは実施していない。

expectedは借用した昇順のcomponent名＋File/Directory種別で、内部入力の構造を検査する。運用上の信頼証拠ではなく、accepted index/親path/receipt/roundに結合するproducerは未実装。visitorに渡すkindも期待値であり、実FDの型やmetadataを検証済みとはしない。戻り値は成功/有限失敗だけで、ClosureObservation/全closure seal/実行permitは発行しない。

## 2. 実装した不変条件

- 最大100,001 childrenを**割当前**に検査し、無効component、File/Directory以外、未整列、重複expectedをcursor取得前にBindingで拒否する。長さ超過/割当失敗はLimit。
- immutable expectedをsort/copyせず、固定長seenをbounded allocation。列挙名の蓄積や成長するHashSetは使わない。
- enumは既存の1呼出し1試行。同名判定は大小文字を区別する完全一致。`.hidden`等もexpected対象。
- `.`/`..`は各1回だけ許可し、child openしない。dotの再出現、余剰/未知名、既出childはChangedで停止する。
- 二分探索でexpectedに一致し、seen未出現を確認・更新してから初めてchildをopenする。未知名はchild open/visitor/metadata/readより前に拒否する。親anchorとcursorの取得は別途必要で、open総数0を意味しない。
- EOFで未出現childがあればChanged。enum ErrorはReadFailedのままで、missing/EOFへ変換しない。
- visitor失敗はstickyに保持。握り潰された元失敗、cleanup不明、期限/取消も次のenum前に停止。owner/prechargeで一度だけ解放し、元失敗理由を上書きしない。

## 3. 追加12テスト

| テスト | 結果 |
|---|---|
| 全childrenを異なる3順序で列挙 | 成功。dotfile・期待directory・index名を各1回訪問。dotの有無/順序に依存しない |
| 未知4名（巨大file想定名・未知directory名・部分一致・大小文字違い） | Changed。open2はanchor/cursorだけ、child open/visit/read/metadataは0。後続3件を列挙しない |
| 全期待名の後の余剰/各期待名の重複 | Changed。正常3件だけ訪問、拒否名で追加openなし。後続entryを列挙しない |
| missing 0/1/2件出現・空expected | missingをEOFで拒否。空集合はEOF/dotだけなら成功、最初の余剰はopen前拒否 |
| dot重複と不正component | Changed、child open0 |
| expected重複/未整列/dot/path/kind不正 | Binding、cursor/enumなし。anchorのみ一度解放 |
| visitor失敗/child cleanup不明 | 次のenumなし。HashMismatch/Unavailable、全owner一度解放 |
| 最初のenum遅延Cancel/Deadline | 元理由保持。child open0、cursor/anchorを解放 |
| 残work0〜21 | 21だけ成功。全停止prefixでlive/予約0・解放重複なし、100万を超えない |
| expected 100,001/100,002 | 前者は構造検査後EOF missing、後者は割当前Limit。後者は4 workのみ、cursorなし |
| 別親の同名child | 各親のseenを分離し2件とも訪問。合成の入れ子呼出しでpeak live5、open8/cleanup8、重複解放なし |
| visitorが元失敗を握り潰す/enumがError | sticky HashMismatch保持。enum Interrupted/UnavailableはReadFailed、共有retry残8不変 |

未知名拒否を一時的に「探索不一致でも先頭childを選択」へ変える感度検証を行った。`unknown_name_is_rejected_before_child_open_or_visit` が `unknown child visited` で期待どおり失敗した（0 passed / 1 failed）。変異を復旧し、全体を再実行した。変異は最終ソースに残していない。

## 4. work計数とモデル未接続

helper自身の課金はsetup2＋expected検査n＋seen初期化n＋enum2q＋yield分類y＋探索実比較c＋seen照合/更新m＋EOF分類（到達時1）＋missing走査k。open/precharge、visitor、外側scope2は別。

成功時 `5+7n+3d+c`（dot数d<=2）。1 child/dotなしはhelper13、anchor/cursor/childのopen/precharge6、scope2の合計21 workで実計数した。すべて元SharedBudgetを使い、元期限/work/payload/既存予約/retryをresetしない。

二分探索の比較1回ごとにworkを課金している。従来候補式の `3H` をこの実装へそのまま使うことはできない。数量計算器 `bp5-r2-scan-work-0.1` は変更しておらず、今回のsubsetを覆う受付上界とは扱わない。lookup費・expected生成/構築・scope費の所有表、独立allocation/3round配賦の照合は後続課題であり、全体受付は無効。

## 5. 実行結果

各shellコマンドは`bdo`経由。すべてoffline/lockedで実行。

| コマンド | 結果 |
|---|---|
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml scan_ops::tests::children` | 12 passed / 589 filtered out |
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml`（変異復旧後） | **601 passed、5 suites、7.79秒** |
| `cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功 |
| `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 成功 |
| `cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check` | 成功 |

## 6. 残課題

保護されたexpected producer/親・round結合、完全metadata policy/前後比較、実size/hash/EOF結合、信頼anchorからの全path再解決、全entry観測構築・seal、lookupを反映するworkモデルと全体受付、独立resource配賦、OS列挙ABI/hidden buffering/cleanup hard期限。合成のnames一致は実filesystem完全性・ABA防止・更新lease・実行安全性の証明ではない。
