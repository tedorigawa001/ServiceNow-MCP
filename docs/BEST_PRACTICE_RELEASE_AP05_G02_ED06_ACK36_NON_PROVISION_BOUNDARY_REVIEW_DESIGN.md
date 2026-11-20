# AP05 G02：ED06／ACK-36 非提供審査前の経路分離・旧Promise影響の静的照合

Version: release-ap05-g02-ed06-ack36-non-provision-boundary-review-draft-0.1 / Date: 2026-11-20。

Status: **現行source・旧試験の静的照合のみ。ED06は未選択・未承認。非提供、候補での分離、旧保証の回復はいずれも未確認。外部利用実態と適格な登録結合欠失対照の可否はUnknown。G02は未充足、SL01は起動0。候補revision・digest・観測手段・欠失を作る手段は未確定。数値・保全方式・保全先は未承認。** 読取り基準 `3d0db3a` は製品候補ではない。

[処遇審査条件](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_NO_CONTROL_DISPOSITION_REVIEW_DESIGN.md)の非提供を審査するための資料。旧保証維持・回復先行の選択肢は閉じない。[登録結合欠失の静的照合](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_BIND_BOUNDARY_STATIC_REVIEW_DESIGN.md)の「適格な既存境界は照合範囲で未確認」を引き継ぐ。[G01のED06](BEST_PRACTICE_RELEASE_AP05_G01_ENTRY_EVIDENCE_RECONCILIATION_DESIGN.md)、[AP02範囲基準](BEST_PRACTICE_RELEASE_AP02_REMOVAL_SCOPE_BASELINE_DESIGN.md)のS03／05／07・K02〜04、[個別処遇案・承認票](BEST_PRACTICE_RELEASE_AP05_G02_ED_INDIVIDUAL_DISPOSITION_APPROVAL_DESIGN.md)のED06／N2-R11を参照し、元の票・旧case分類を変更しない。

通常経路・旧試験／fixture・期待値・故障位置を維持する。通常経路未切替、正式発行口・C実行入口／body起動閉鎖、全体受付無効、Unknown・VM／監視／telemetry調査保留、元期限・既定並列度を維持する。今回は本MDのみ。実装・実測・試験実行・build／梱包／展開・故障注入・実接続・実通信・設定変更・公開・コミット・Pushは行わない。

## 1 旧専用辺と、通常側に残る実bind・停止・解放

| 境界／静的根拠 | 旧synthetic側：非提供の審査対象候補 | 通常側：残す責務と分離の確認点 |
|---|---|---|
| 入口とfactory：[session](../src/servicenow/bounded-read.ts)・[通常client](../src/servicenow/client.ts) | `prepareNewReviewComposition` の旧 `synthetic_io` overload、専用 `PreparedSummary` 依存、`pinCompositionFakeIO` によるtranscriptの検査・bytes copy、`#prepareCompositionIO` を起動する分岐 | 公開static method全体や通常factoryを削除しない。通常の `BoundedReadSession` 生成、snapshot／policy・期限・取消／admission・先行診断と、options省略時の同期 `ConstructorSummary` を残す。型と実行分岐は別に照合 |
| 合成入力と会計：[fake I/O](../src/servicenow/review-composition-fake-io.ts)・[bootstrap契約](../src/servicenow/review-bootstrap-contract.ts) | 合成200のResponse／Streams、固定dispatch、親／releaseのprivate ackとcapture・consumer、比較／handoffへの旧実行辺。専用fake I/OのJS／宣言／各mapとsessionからの参照を審査 | 通常K02のfetch／GETと観測・legacy判断、単一canonical／bootstrap会計を維持。`review-bootstrap-contract` には[lifecycle](../src/servicenow/review-evidence-lifecycle.ts)からも参照がある。旧sessionの呼出し辺だけを切る計画と、共有module自体の撤去を同一視しない |
| K02：後段の実bindと拒否：[source](../src/review/bounded-source.ts)・session・lifecycle | 旧consumer経由でも `#completeRelease` は共有の `bindReviewReleaseSource` を呼ぶ。`#prepareCompositionIO` が渡す `hooks.bind` は `inspectSource` による**登録後の再照合**で、新規登録ではない。その後の `inspectPrepared` と旧prepared／後段Promiseが旧専用の呼出し辺 | `readParent` → `resolveRelease` → `matched` → 同sourceのPermit／固定snapshot／port → `releasePortFor` → 同session／snapshot／lease・登録owner／readyへの `bindSource` を保持。`listMetadata`／`readPayload`／`verify` の `#requirePermit` とowner照合は取得前に残す。旧hooksを外すことを共有実bind・通常guard・通常診断 `prepared_only` の削除にしない |
| K03：一次理由と停止 | 旧bootstrapの失敗・通常打切りの分岐、旧 `#compositionRevoke` からのconsumer／contract失効、旧 `#clearReleaseComparison` 等への接続は、旧実行辺・旧診断の責務として切り出す対象 | session `stop` のwriterへの一次理由保持、登録ownerの `revoke`、ready／source binding失効、controller停止を残す。通常adapterの段別結果・取消と判定を変えない。旧専用clearの削除を共有stop全体の削除、あるいは通常stop完了の証拠にしない |
| K03：close／部分生成rollback | 旧成功側の `#finishCompositionTime`、旧 `finally` の `sourceClosed`／discard側への接続、観測／consumer／contract失効、予約解放、外側fake `dispose` と固定closeへの接続を個別に追う。呼出し記述は全失敗prefixでの解放完了の証拠ではない | [通常adapter](../src/review/update-set-adapter.ts)のworker close待ちとsession close、session `#close` → `#rollbackConstruction` の固定順を残す。旧 `source_transport` の継続を外す候補でも診断shapeを消さず、登録owner／core・listener／timer／controller・admission／snapshotの解放、未確認と一次理由の保持を分ける。worker完了通知・エラー返却・`finally` 到達だけで確認済みにしない |
| K04：省略時の初期結合／予約返却 | 旧syntheticは同じ `#openComposition` を旧creation付きでも使用する。旧key・capture参照を分離する対象で、`#compositionStarted` や通常用 `#checkComposition` を名前だけで削除しない | 通常 `#prepareComposition` → `#openComposition` で同owner／sourceを作り、transport claim → `bindInitialSource` → `claimStatusBinding` → 同coreの `takeBootstrapAccounting`／`connectAccounting` → constructionの `bindSource`。reserve → inspect → `finally` release → 固定close、C/G/P=0、auth=false／ready世代0、dispatch不可・正式発行無効を維持。現行の共有呼出しは第3に変数 `creation` を渡す。通常2引数化はC07-Bに基づく将来条件で、実施済みとしない |

[元ACK-36](../tests/review/private-composition-ack.test.ts)が直接確認するのは、`bindReviewReleaseSource` の非throw no-op下で返った旧runのPromiseが `code: internal_review_error` で拒否されること。[NS02 N2-R11](BEST_PRACTICE_RELEASE_AP01_NS02_ACK_RELEASE_GUARANTEE_REVIEW.md)は未対応のまま。上記の旧 `hooks.bind`／`inspectPrepared` の順はsource上の説明であり、元試験が内部拒否位置、一次理由、実I/Oやcleanup完了を直接検査したとはしない。旧後段の再照合と、通常metadata guardの拒否は別の保証。

## 2 旧Promise利用者への影響（仕様差、実利用はUnknown）

| 利用面 | 現行と採用済み案Pの差 | 審査に残す確認事項 |
|---|---|---|
| `prepareNewReviewComposition` の返却境界 | 現行static methodはasync宣言ではない。options・snapshot／target・transcript pin・constructorの先行失敗は同期throw。先行処理を通り旧synthetic分岐へ進んだ場合だけ、旧prepared成功または後段拒否のPromiseを返す。[C02〜04案P／C06採用記録](BEST_PRACTICE_RELEASE_AP03_C02_C04_C06_COMPATIBILITY_REVIEW.md)では禁止own `synthetic_io` を値・列挙性によらず先行受付で同期 `invalid_input`。旧Promiseは返さず、旧後段へ進まない | 元ACK-36のPromise拒否と入口同期拒否を同じ `reject` と書かない。通常の許可options／省略は同期 `ConstructorSummary` のまま。旧キーを単に外して通常summaryを得ても、旧prepared、旧合成I/O・課金・故障判定の代替にはならない |
| 呼び出し側の連鎖・エラー分類 | 返り値の `.then`／`.catch`／`.finally` は同期throwならその式で接続されない。呼出しも同じ `try` 内の `await` なら捕捉できるが、code・発生段と後段処理は異なる。外側async wrapperの拒否になっても、本体が旧Promiseを返した証拠ではない | 同期throwで後始末が変わる呼出し形状、旧 `internal_review_error` 分岐、prepared成功依存の有無を別欄で把握。Dのunknown／withheldや通常adapterの結果を旧rejectへ換算しない（[AP04結果差](BEST_PRACTICE_RELEASE_GUARANTEE_RECOVERY_SCOPE_REVIEW.md)） |
| TS宣言・JS・deep import | C06は専用overload／宣言依存と廃止対象を別審査し、残る通常module・通常型を維持する方針。旧TSのoverloadが使えなくなることと、JSの同期拒否、専用moduleの解決失敗は同じでない | 旧専用宣言と通常同期overload、余剰keyの変数経由とJSを別確認。通常module内の旧named／namespaceの扱いと、AP02で廃止とされたmoduleのdeep解決を分ける。shimやpackage全体のexport制約をここで採用しない |

固定名 `prepareNewReviewComposition`／`PreparedSummary`／`CompositionFakeIO` を現行の `src`・`bin` と旧 `tests/review` で照合した。`src`・`bin` の一致はsessionの定義・専用fake I/O参照に限られ、旧合成呼出しは[ACK本体](../tests/review/private-composition-ack.test.ts)や[FX05](../tests/review/fixtures/compiled-private-composition-ack.mjs)、時刻系fixture等にある。これは固定名で追えたrepo内の範囲に限る。配布済みtarball、別名／動的参照、外部consumerやdeep import利用の実態は確認していない。タグ・件数・repo内に通常呼出しが見当たらないことを、外部利用者なし／影響なしの根拠にしない。

## 3 非提供を審査する前の不足と停止条件

| 審査欄 | 不足する証拠・次に必要な区別 |
|---|---|
| 旧専用辺と通常Kの分離 | G01で候補の切る／残す辺と引受役割を確定し、JS・宣言・JS map・宣言map、別名／再export／解決済み動的辺、添付との区別を同候補で示す。通常module正常load、SL09の実bind／同Permitによるmetadata、SL08の初期結合／同core・予約返却、通常停止・通常／部分生成closeの照合を独立に要求。`prepared_only`／`constructor_bound`、既存のsource試験や旧fixtureは候補実績ではない |
| 通常の拒否と未確認の単独欠失 | 通常不正・失効時の停止／取得前拒否、一次理由と解放、通常K03の適用範囲を示す。既存の偽造／foreign／取消の対照や通常実bindだけを「同sourceの正規Permitはあり登録だけ欠ける」証拠にしない。この厳密な対照を通常側でも要求する場合、適格な欠失・非介在観測が未確認なので起動0。旧専用保証の非提供審査で通常側の不足を免除しない |
| 旧Promise利用者と残差の引受 | 呼出し形状／専用宣言・deep import・例外／後始末依存の調査範囲と確認できない範囲、AP03とAP04の結果差、外部説明案、ED06の未代替保証と将来回復条件を個別票へ。Hの試験保持、通常source／session・lifecycle・adapterの責務、配布と外部説明の責務を分け、人・期限・許容影響は未確定とする |
| 候補pinと終了・保全 | [G03](BEST_PRACTICE_RELEASE_AP05_G03_CANDIDATE_PIN_DESIGN.md)の段階別pinと[候補入場条件](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_ADMISSION_DESIGN.md)、[G04](BEST_PRACTICE_RELEASE_AP05_G04_EXECUTION_CUSTODY_DESIGN.md)の通常枠／cleanup予約、同slot／attemptの終了四軸・post-pin・保全を別に満たす。未取得の後段digestは前段に要求せず、当該段で必要な証拠・許可が不足すれば起動0。エラー・close呼出し・runner exitで未確認の解放を補わない |

通常K・共有writer／解放の分離、外部影響と残差の引受、当該段のpin／証拠／必要な許可のいずれかが不足する場合、非提供の決裁に進まない。適格な欠失対照が見つからないことは受容理由にしない。個別処遇・保証低下、AP02実装／friend撤去、AP04結果差の受容、AP05候補検証と旧試験切替、AP06公開は別承認。**現時点はED06未選択・未承認、旧試験・閉鎖条件・Unknown・調査保留を維持し、G02未充足、SL01起動0。**
