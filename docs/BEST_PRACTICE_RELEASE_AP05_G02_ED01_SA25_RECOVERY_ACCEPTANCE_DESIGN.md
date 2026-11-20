# AP05 G02：ED01／SA-25の回復先行案・受入条件

Version: release-ap05-g02-ed01-sa25-recovery-acceptance-draft-0.1 / Date: 2026-11-20。

Status: **設計のみ。ED01の処遇は未選択・未承認。回復は未確認、G02は未充足、SL01は起動0。候補revision・digestは未確定。数値・観測手段・保全方式・保全先は未承認。** 静的照合基準 `05a0abf` は文書・現行source／旧testの読取り用で、製品候補ではない。

[ED01〜07個別処遇案・承認票](BEST_PRACTICE_RELEASE_AP05_G02_ED_INDIVIDUAL_DISPOSITION_APPROVAL_DESIGN.md)のED01だけを対象とする。[G02旧assertion・回復条件](BEST_PRACTICE_RELEASE_AP05_G02_OLD_ASSERTION_RECOVERY_DESIGN.md)と[AP01残差台帳 A1-X01](BEST_PRACTICE_RELEASE_AP01_INDIVIDUAL_APPROVAL_RESIDUAL_LEDGER.md)の元保証を保持し、[G01のED01](BEST_PRACTICE_RELEASE_AP05_G01_ENTRY_EVIDENCE_RECONCILIATION_DESIGN.md)と[AP02範囲基準](BEST_PRACTICE_RELEASE_AP02_REMOVAL_SCOPE_BASELINE_DESIGN.md)のS02・通常K04／K02に結ぶ。`53eff59` の[C07-B採用記録](BEST_PRACTICE_RELEASE_AP03_C05_C07_COMPATIBILITY_DECISION_DESIGN.md)と[C06採用記録](BEST_PRACTICE_RELEASE_AP03_C02_C04_C06_COMPATIBILITY_REVIEW.md)は仕様根拠で、撤去・個別処遇・実行の許可ではない。旧caseの正規分類は未対応のまま。

通常経路・旧試験／fixture・期待値・故障位置を維持する。通常経路未切替、正式発行口・C実行入口／body起動閉鎖、全体受付無効、Unknown・VM／監視／telemetry調査保留、元期限・既定並列度を維持する。今回は本MDのみ。実装・実測・試験実行・build／梱包／展開・実接続・実通信・設定変更・公開・コミット・Pushは行わない。

## 1 旧SA-25：同じ既存sessionでの四つの直接assertion

[元SA-25](../tests/review/source-status-binding.test.ts)の `cannot attach a private status consumer to an existing session with a guessed key` は、通常の `new BoundedReadSession(snapshot())` で作った実session `s` を次の2呼出しに使う。直接claimに渡す空objectのkeyと、constructorのcreation内の空objectのkeyは別リテラル。同一の正規keyを再利用する試験ではない。

| 観測 | 元の注入位置と期待値 | 観測の限界 |
|---|---|---|
| 旧claim拒否 | `claimPrivateCompositionSource(s, {}, {} as never)` を直接呼び、戻り値が厳密に `false` | import失敗、名前不在、別rootでの入力拒否ではない。第3引数の空objectは直接呼出し用のsource代用品 |
| 同期拒否 | 同じ `s`・正規にparseした入力・推測 `key` 付きの旧creationを `new BoundedUpdateSetSource` に渡し、その呼出し自体が同期に `invalid_input` を含むerrorをthrow | 元は `.toThrow('invalid_input')`。`code` fieldの厳密比較やPromise拒否を検査したものではない |
| capture未呼出し | 同じcreationの `capture` はspyで、throw後に未呼出しを確認 | `check`／`take`／`takeStatus` の回数は直接assertしない。`403`／`cancelled` は `takeStatus` の合成戻り値で、受信・cleanup確認の証拠ではない |
| requests=0 | 同じ `s` の `s.stats().requests` が `0` | 観測はsession会計のrequest数。別途の通信spy、受信／payload費目、全状態不変・無割当て、`finally` の `s.close()` の完了は直接assertしていない |

静的な停止位置も分ける。[session](../src/servicenow/bounded-read.ts)の `sourceConstructionClaim` は通常生成した `s` にprivate composition keyがないため、`#compositionSource` 代入前に `false`。[source constructor](../src/review/bounded-source.ts)は `#session` 代入後、truthyなcreationの `key` を使った旧claimで拒否し、callback採用・captureへ進まない。これはソース上の順序で、四つの直接assertionを増やすものではない。ED04のcreation内key variantと拒否後会計、ED05の成功static設置、ED06の後段bindをSA-25に混ぜない。

## 2 旧保証・候補の拒否／不在・通常の正対照を分離する（未実施）

| 対照 | 固定する対象 | 将来の受入条件と代用不可 |
|---|---|---|
| H：旧SA-25を保持 | 元実class・旧入口を含む基準と元test。通常生成の同じ `s`、各推測key、元の注入位置を固定し、候補配布物の結果と分ける | 四つの直接assertionすべてを元位置で確認する。旧claimが既にないP、型検査だけ、試験stubによる拒否、[DR-20](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dr-20)の別root拒否で代用しない。[FX03／04の試験分離設計](BEST_PRACTICE_RELEASE_AP05_PK02_FX03_FX04_VERIFICATION_SPLIT_DESIGN.md)の旧compiled対照もSA-25の四点を収録していない |
| P0：候補JSで旧creationを拒否 | 正常にloadできる候補の通常module・実class。同じ候補由来の通常生成sessionと正規入力に、第3引数として旧creationを渡す（SL17） | C07-Bどおり、creationの中身を読む前に同期 `BoundedReadError`（`code=invalid_input`）。想定した拒否位置、capture未呼出し、同session `requests=0` を別々に確かめる。引数評価・class field初期化・割当てが0とはしない。候補の拒否理由一致を旧claimの `false` と同一視しない |
| P0：候補から外部採用辺を除く | S02の旧claim／登録、creationとcallbackへの到達、C06の宣言・JSの公開境界。P+と同じ未変更候補 | 通常moduleのloadを正対照とし、旧named／namespace、別名・再export・deep import／転送から到達しないことを確認する。専用宣言・出力JS／両map・残留登録も別欄。廃止対象module自体の解決失敗と、残すmoduleの旧名不在を分ける。名前検索だけ・依存欠落・未解決の動的辺は不在成功にしない |
| P+：K04／同owner初期結合 | 省略時の `prepareNewReviewComposition` から通常2引数で作るsource。SL08のpre-I/O対照 | 同session／snapshot／core／lease／owner・同じsourceの初期結合と会計接続を確認。通常同期 `constructor_bound`／`initial_source: bound`、auth=false／ready世代0、C/G/P=0、予約返却・固定close、dispatch unavailable・正式発行無効を維持。後段Permitの正対照ではない |
| P+：K02／通常matchedのPermit | K04とは独立の通常2引数sourceと同session。通常経路に合成応答だけを供給し、SL09で観測する案 | 通常 `readParent` → `resolveRelease` → legacy判定でmatched → 同sourceのPermit／snapshot／portを正規 `bindReviewReleaseSource` で同session／ownerの現readyへ結合。同じPermitで通常の後続metadataを通す。summary・同値copy・no-op bindは不可。K04のrequests=0を合成取得を伴うこの対照には求めない。正式発行口の許可ではない |

## 3 通常経路の同一性と候補の判定境界

- **初期結合の順序。** `#openComposition` の通常sourceから、同handle／snapshot／leaseで transport claim → `bindInitialSource` → `claimStatusBinding` → 同coreの `takeBootstrapAccounting`／`connectAccounting` → constructionの `bindSource` を通す。[lifecycleの前段](../src/servicenow/review-evidence-lifecycle.ts)は同source・未ready・空の予算状態を検査する。[現行compiled通常準備](../tests/review/fixtures/compiled-canonical-session.mjs)のsummaryは正対照の一部で、単独では参照同一性を証明しない。現行コードは `new BoundedUpdateSetSource(this,input,creation)` と書くため、省略laneでも将来は内部呼出しを2引数にすることを確認する。変更済みとはしない。
- **後段の通常Permit。** matchedで作られる同sourceのprivate Permitと固定release snapshot／portを `releasePortFor` で照合し、lifecycleは同snapshot／leaseと現在のreadyを使って受理する。[通常source結合試験](../tests/review/source-release-binding.test.ts)は既存の合成入力で `prepared_only` と同Permitのmetadata継続を確認する静的参照。K04で残す `claimStatusBinding` は初期結合・会計用で、外部status consumerの旧claimにも、通常Permitの発行にも当たらない。
- **C07の互換対照は別入力。** [固定slot／変異manifest](BEST_PRACTICE_RELEASE_AP05_FIXED_SLOT_MUTATION_MANIFEST_DESIGN.md)のSL10では、宣言上の通常2引数とJSだけで許容する「第3引数そのものが明示 `undefined`」を別に確認する。`{key: undefined}` やSA-25の `{key: {}}` を同じ扱いにしない。第3の他値と4引数以上はSL17内でも別入力。PΔを追加する場合は別承認後、固定した一変異と検査理由の構造対照とし、変異artifactを実行しない。本MDでslot・変異・観測手段は追加確定しない。

## 4 再審査に渡す証拠・責務と停止条件

- Hの四観測と停止位置、P0の同期理由・未呼出し・会計と外部採用辺の照合、P+のK04／K02をそれぞれ独立に記録する。残す通常moduleとartifactの由来、段階別pinを[G03](BEST_PRACTICE_RELEASE_AP05_G03_CANDIDATE_PIN_DESIGN.md)へ、slot／attempt別の終了四軸・未確認時の保全責務を[G04](BEST_PRACTICE_RELEASE_AP05_G04_EXECUTION_CUSTODY_DESIGN.md)へ結ぶ。実参照を照合した結果を保持し、参照の生値、Permit・lease・認証情報を記録へ出さない。照合のための新friend・公開getter・代替旧入口は作らない。
- source／session ownerはS02の旧claim拒否境界と通常K02、登録owner・会計ownerはK04の初期参照と同core、配布審査側はC06と未解決到達辺、旧試験担当はHの四観測と注入位置を引き受ける。人の担当・期限は未割当。ED01の処遇、保証低下の受容、AP02実装／friend撤去、候補検証、旧試験切替、公開は個別の承認事項。本MDはどれも承認しない。
- Hの四点、P+の同一性、P0の拒否／不在、または対応する終了・pin・承認が欠ければ、未確認はUnknownとして審査保留。候補PがC07-B・C06を満たしても、撤去後に同じ旧claimを呼んで `false` を観測する保証は候補に移っていない。この残差を不在で埋めず、同位置の保証が必要なら回復先を示すまで保留する。**ED01の処遇は未選択・未承認、G02は未充足、SL01は起動0**とする。
