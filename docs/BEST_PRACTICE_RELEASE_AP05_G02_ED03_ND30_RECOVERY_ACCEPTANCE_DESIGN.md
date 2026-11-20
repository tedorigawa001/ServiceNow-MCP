# AP05 G02：ED03／ND-30の回復先行案・受入条件

Version: release-ap05-g02-ed03-nd30-recovery-acceptance-draft-0.1 / Date: 2026-11-20。

Status: **設計のみ。ED03の処遇は未選択・未承認。回復は未確認、G02は未充足、SL01は起動0。候補revision・digestは未確定。数値・観測手段・保全方式・保全先は未承認。** 静的照合基準 `01fb5f7` は現行文書・source／旧testの読取り用で、製品候補ではない。

[ED01〜07個別処遇案・承認票](BEST_PRACTICE_RELEASE_AP05_G02_ED_INDIVIDUAL_DISPOSITION_APPROVAL_DESIGN.md)のED03だけを対象とする。[G02旧assertion・回復条件](BEST_PRACTICE_RELEASE_AP05_G02_OLD_ASSERTION_RECOVERY_DESIGN.md)、[AP01残差台帳 A1-X03](BEST_PRACTICE_RELEASE_AP01_INDIVIDUAL_APPROVAL_RESIDUAL_LEDGER.md)、[G01のED03](BEST_PRACTICE_RELEASE_AP05_G01_ENTRY_EVIDENCE_RECONCILIATION_DESIGN.md)を、[AP02範囲基準](BEST_PRACTICE_RELEASE_AP02_REMOVAL_SCOPE_BASELINE_DESIGN.md)のS01／06・通常K01／04と[PK02／FX03の試験分離](BEST_PRACTICE_RELEASE_AP05_PK02_FX03_FX04_VERIFICATION_SPLIT_DESIGN.md)に結ぶ。`53eff59` の[C06採用記録](BEST_PRACTICE_RELEASE_AP03_C02_C04_C06_COMPATIBILITY_REVIEW.md)は型・import面の仕様根拠で、撤去・個別処遇・実行の許可ではない。正規旧case分類は未対応のまま。

通常経路・旧試験／fixture・期待値・import順を維持する。通常経路未切替、正式発行口・C実行入口／body起動閉鎖、全体受付無効、Unknown・VM／監視／telemetry調査保留、元期限・既定並列度を維持する。今回は本MDのみ。実装・実測・試験実行・build／梱包／展開・変異操作・実接続・実通信・設定変更・公開・コミット・Pushは行わない。

## 1 H：旧ND-30とFX03の直接assertionを維持する

| 観測 | [元ND-30](../tests/review/native-session-composition.test.ts) | [旧compiled FX03](../tests/review/fixtures/compiled-native-session-composition.mjs) |
|---|---|---|
| 旧classの指定own名不在 | ND wrapperの静的import後、`Object.hasOwn(BoundedReadSession, 'probeNativeStatusComposition')` が `false` | 旧 `dist` の実classとND wrapperで同じown判定。どちらもprototype・継承・別名・module exportの不在は直接assertしない |
| 同ND slotの再取得が同期拒否 | `await import` で旧 `bounded-read` のexportを得た後、`takeNativeStatusCompositionProbe()` 自体が同期にthrow。元の `.toThrow('internal_review_error')` を保持 | `assert.throws(() => takeNativeStatusCompositionProbe(), /internal_review_error/)` を保持。FX04の `code` 比較へ変更せず、import失敗・probe呼出しのPromise拒否とも区別する |

**最初の取得はソース上の根拠。** [旧session module](../src/servicenow/bounded-read.ts)のclass static blockが `nativeStatusProbe` に固定継続を登録し、[旧ND wrapper](../src/review/abort-scope-evidence-native-diagnostic.ts)のmodule評価時に `const nativeCompositionProbe = takeNativeStatusCompositionProbe()` で取得する。取得関数はそのslotを `undefined` にしてから返し、空なら同期throwする。ND-30本体は初回の戻り値・取得回数・再登録経路を直接検査していない。必要なら別対照とし、元assertionは増やさない。FX03の403／404×body有無と401＋cancel内同期throwの診断・cleanup対照は現行のまま保持し、ND-30の二点や候補の不在検査へ合算しない。

Hは元source試験と、同旧revision由来のbuild／wrapper／FX03をそれぞれ固定し、同一実解決先・同module instance・元の先行評価順を保つ。[現行PK02](../tests/review/package-http-classification.mjs)のpack一覧によるwrapper除外と、repo `dist` でのFX03起動は別の処理。どちらも候補同梱の `bounded-read` から取得口・登録・driverへの辺が消えた証拠ではない。SA-26／FX04は別slot、Dの連続native試験は別brandであり、どちらもHの回復先に数えない。

## 2 P+：通常経路の正対照を先に成立させる（未実施）

P+とP0は同じ候補の空build・単一tarball由来の未変更の隔離展開物を使う案。通常moduleの解決・loadと通常動作は別欄で判定する。repo `dist`、src／tsx、隣の成果物・開発loaderへのfallbackは認めず、検査用添付物と配布payloadを分ける。旧ND wrapperの評価・friend取得やdriver注入を通常成功の前提にしない。

| 通常側の正対照 | 将来の受入条件 |
|---|---|
| K01：通常module・実class | 展開rootの `bounded-read` が正常に解決・loadし、通常constructor・固定factory（`BoundedReadSession.create`）・通常依存が残る。実classに合成入力を与え、期限・取消・同core会計、通常停止・固定closeと先行診断を保つ。旧runnerが通常factoryを呼んでいた事実は、factoryを撤去する根拠ではない |
| K04／SL08：pre-I/O同owner初期結合 | options省略時の `prepareNewReviewComposition` から通常2引数sourceを生成する候補設計。transport claim → `bindInitialSource` → [通常 `claimStatusBinding`](../src/servicenow/review-evidence-lifecycle.ts) → 同core会計を確認。同期 `constructor_bound`、auth=false／ready世代0、C/G/P=0、予約返却・固定close、dispatch／発行の閉鎖を維持。[現行compiled通常準備](../tests/review/fixtures/compiled-canonical-session.mjs)は静的参照で、summary一致だけで参照同一性を立証しない |
| 共通PK02のK02／SL09：通常source | 通常2引数source＋合成依存で親→通常release判断→matched時の同source／Permit／port結合と固定closeを別対照にする。旧NDのstatus-only draft（Permit unavailable）にも、K04のpre-I/O保証にも置き換えない。正式発行口の解放を意味しない |

## 3 P0／SL19：取得口・登録・native driverの到達辺を個別に確かめる（未実施）

| 判定対象 | 将来の受入条件 | 代用不可・停止条件 |
|---|---|---|
| 残るmoduleの取得口・class | 通常loadの成功を前提に `takeNativeStatusCompositionProbe` の静的named importが旧名欠落で**link時に失敗**することと、namespace／動的importは**load成功、旧own名不在**であることを分ける。class constructorのstatic口とprototypeの禁止口も別に確認 | 通常moduleの欠落や依存不全、評価時throw、own名が残ったまま値だけ `undefined`、旧関数を呼んだ空slotの同期throwは合格にしない |
| module slot・static登録・専用runner | `nativeStatusProbe` の宣言、class static blockのND登録代入、`#runNativeStatusProbe` の定義と呼出しを別々に記録。旧名を隠しても、登録・再登録・未公開runnerが残れば不在にしない | SAの `statusProbe`／SL18の結果を使わない。通常factoryやlifecycleまで失わせた場合はP+不成立 |
| native driver・bridge・型の辺 | 旧wrapperの評価時取得 → `probeNativeStatusComposition` から同継続へのdriver引渡し → runnerのdriver受付 → `#probeStatusAcceptance` の `native.begin`／`native.run` とscopeのcheck／accept／stop、runnerのclose／disposeを追う。各始点と解決した参照先を候補の構文・export／依存表に照合し、専用driverへの通常entry・別名／再export・解決済み動的辺、`NativeStatusDriver`／`NativeStatusProbeScope` 等の専用定義・宣言参照が残らないことを確認 | `#probeStatusAcceptance` は旧SA／NDで呼ぶ共有の旧継続。両方の呼出しを追い、通常 `claimStatusBinding` と区別する。未解決の動的辺・型と実行辺の混同・文字列検索だけでは不在にしない。禁止経路・driverは実行しない |
| 専用wrapperと配布層 | S06のND wrapperへのdeep importが対象自体の不在で**解決に失敗**することを、残るmoduleのnamed link失敗と分ける。配布manifestでJS・宣言・JS map・宣言map（埋込みsourceを含む）を別確認し、stale出力・shim・添付由来の辺がないことを照合 | wrapperだけの除外、別rootへのfallback、型エラーによるruntime不在の代用は不可。参照先や共有責務が未確認ならUnknown |

**撤去候補と共有責務を別台帳にする。** [BG02共有境界](BEST_PRACTICE_NATIVE_DIAGNOSTIC_BG02_BOUNDARY_DESIGN.md)のBS01〜04は旧bridgeの呼出し箇所を示す。一方、VK01／02の理由・facts、無bridgeの注入workflow、readerの所有・退役、cleanupと診断保持は旧ND取得口の有無とは別の責務であり、[B-03](BEST_PRACTICE_RELEASE_B03_COMPILED_MIGRATION_FAULT_DESIGN.md)で引受先と到達を審査する。現行の旧rootがbridge有／無で実装を共有する以上、旧ND専用の辺を切れることと、無bridge側の責務を回復済みであることは別。通常及び開発側に新friend・optional bridge・同台帳の共有を足さない。LM03とUN62は別gateのまま。

**PΔは検査器の感度だけ。** [固定slot／変異manifest](BEST_PRACTICE_RELEASE_AP05_FIXED_SLOT_MUTATION_MANIFEST_DESIGN.md)のND専用行、MT14（`nd_named_export_present`）、MT16（`nd_probe_slot_present`）、MT18（`nd_private_runner_retained`）、MT20（`nd_probe_registration_retained`）、MT25〜28（wrapperのJS／宣言／両map）、MT30（`nd_friend_dynamic_edge`）、MT31（`nd_friend_type_edge`）を参照する。P+／P0成立後の同候補由来の独立copyに一変異だけ、指定の一次判定・理由と独立終端を要求し、変異artifactは実行しない。MT30／31は指定の動的辺／型辺の感度であって、driver内の各操作やbridge全経路の独立変異ではない。MT14もclass／namespace固有の変異に数えず、SA再export用MT29をNDの感度へ加えない。追加の独立対照が必要なら別審査とし、slot・費目・上限は確定しない。

## 4 再審査に渡す記録と起動0の条件

- **H・P+・P0・PΔを別判定にする。** Hは元のclass own名不在と同slot再取得の同期拒否、P+は通常経路、P0は候補からの不在、PΔは指定混入の検出。旧slot自体が候補にないことは、同slotの二度目を実際に呼んだ拒否の回復ではない。Hを保持し、同じ停止位置の保証が必要な場合は回復先を示すまで保留する。共有診断・resource所有・無bridgeをED03の非提供判断に含めない。
- **由来・役割・終端を記録する。** 旧ND slot／driver／wrapper ownerはHの元条件と旧専用辺、session／lifecycle ownerは通常K、B-03側は共有診断／resource責務、配布審査側はS01／06とC06の判定を担う。人の担当・期限は未割当。[G03](BEST_PRACTICE_RELEASE_AP05_G03_CANDIDATE_PIN_DESIGN.md)の段階別pinと[G04](BEST_PRACTICE_RELEASE_AP05_G04_EXECUTION_CUSTODY_DESIGN.md)の終了四軸・未確認時の保全に結び、対象／参照先・出力層・固定理由・残存責務だけを保持する案。friend、driver、scope、認証情報の実体は記録に出さない。
- **不足はUnknownで止める。** 通常の正対照、ND専用辺と共有責務の分離、候補pin、前slotの終端・cleanup予約、各承認が不足すれば起動0。試行後の不一致・終了未確認は新規slotを止め、先行理由と未解決責務を承認済みの上位枠へ渡す設計に限る。ED03の処遇・保証低下、AP02実装／friend撤去、候補検証、旧試験切替、公開は別承認。**現時点はED03未選択・未承認、G02未充足、SL01から起動0。**
