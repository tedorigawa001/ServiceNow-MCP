# AP05 G02：ED06／ACK-36 旧Promise利用影響の確認範囲・外部説明案

Version: release-ap05-g02-ed06-ack36-promise-impact-notice-draft-0.1 / Date: 2026-11-20。

Status: **審査資料・未公開の説明案。外部利用の実態はUnknown。ED06の処遇は未選択・未承認、G02未充足、SL01は起動0。候補revision・digest・観測手段は未確定。数値・保全方式・保全先は未承認。** 読取り基準 `0d9ed43` とAP03採用記録 `53eff59` は文書・現行source／旧試験の参照で、製品候補や配布済み版を示さない。

[ED06の経路分離・静的照合](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_NON_PROVISION_BOUNDARY_REVIEW_DESIGN.md)と[処遇審査条件](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_NO_CONTROL_DISPOSITION_REVIEW_DESIGN.md)を前提に、[個別処遇案・承認票](BEST_PRACTICE_RELEASE_AP05_G02_ED_INDIVIDUAL_DISPOSITION_APPROVAL_DESIGN.md)のED06／N2-R11へ影響確認の案を渡す。処遇・承認票・旧case分類は変更しない。通常経路・旧試験／fixture・期待値・故障位置を維持し、通常経路未切替、正式発行口・C実行入口／body起動閉鎖、全体受付無効、Unknown・VM／監視／telemetry調査保留、元期限・既定並列度を維持する。今回は本MDのみ。外部照会・利用情報の収集・実装・実測・試験実行・build／梱包／展開・実接続・実通信・設定変更・公開・コミット・Pushは行わない。

## 1 影響の対象と、静的に分かる限界

対象は、通常のレビュー全体ではなく、[現行の `prepareNewReviewComposition`](../src/servicenow/bounded-read.ts) に `options` 自体の `synthetic_io`（own property）を渡す旧合成経路と、その返り値・後始末・型／読み込み先への依存。現行でも入力検査やsession生成の失敗は同期throwになり得る。先行処理を通って旧合成分岐へ入った場合だけ、`prepared_only` 成功または後段拒否のPromiseを返す。[旧ACK-36](../tests/review/private-composition-ack.test.ts)が直接示すのは、元の実class・no-op bind故障でのPromise拒否（`code: internal_review_error`）。[FX05](../tests/review/fixtures/compiled-private-composition-ack.mjs)は正常preparedの別対照で、同じ故障検出や外部利用の証拠ではない。

[C02〜04案P／C06の採用記録](BEST_PRACTICE_RELEASE_AP03_C02_C04_C06_COMPATIBILITY_REVIEW.md)の仕様は、禁止own `synthetic_io` があれば値・列挙性に関わらず受付で同期 `BoundedReadError`（`code=invalid_input`）、旧Promiseを返さず、旧合成処理を開始しない、というもの。`synthetic_io: undefined` は省略と異なる。許可される通常options／省略時の同期 `ConstructorSummary` は残す仕様で、通常経路が候補で確認済みという意味ではない。継承値／外側Proxy、TSの専用宣言、廃止専用moduleはAP03の別境界とし、この説明で一般の引数受付やpackage全体のexport制約を変更しない。

現行 `src`／`bin` の固定名照合はsessionの定義と専用fake I/O参照、`tests/review` では旧試験・fixtureでの呼出しを確認した範囲まで。[package設定](../package.json)や試験の同梱期待は、配布済みtarballの実体・実解決先・外部利用の証拠ではない。外部コード、別名／転送や動的import、利用版・件数・依存の深さはいずれもUnknown。公開窓口、利用者数、対応版は決めない。

## 2 利用形態ごとの確認範囲と必要証拠（確認の実施は未承認）

| 確認する形態 | 仕様から分かる影響 | 後で必要な証拠 |
|---|---|---|
| 直接呼出し、返り値の保存、`.then`／`.catch`／`.finally` | 同期throwなら返り値が作られず、その返り値に連結する処理は登録されない。Promise集約へ渡す前に呼出し式を評価している場合も、集約された拒否として届くとは限らない | 呼出し式と例外境界の前後、返り値の利用先、旧codeでの分岐、後始末が戻り値チェーンにしかないか。利用側が先に確保したものの責務を、旧sessionの後始末と分ける |
| `try` 内の `await`、async wrapper・別名／転送 | 同じ `try` に呼出し式が含まれれば同期throwも捕捉できる。呼出しが `try` の外にあればawait側で捕捉できない。外側async wrapperのPromise拒否になっても、前後処理・code・本体の返却契約は同じでない | 呼出しがどの境界で評価されるか、wrapperが同期例外を包む／握りつぶす／再分類するか、外側のcatch／finallyが担当する範囲、転送で禁止own keyが実際に届くか |
| 旧 `prepared_only` の成功値、後段 `internal_review_error`、合成実行の副作用 | 旧success summary・後段拒否のどちらも返らず、合成I/O・課金・元の故障検出へ進まない。通常summaryやDの `unknown`／`withheld` は代替にならない | どのfield／後段code・時点に依存するか、旧結果が来ない場合に誤って後続処理や再試行を進めないか、通常Kとは別の未代替保証かを記録（[AP04結果差](BEST_PRACTICE_RELEASE_GUARANTEE_RECOVERY_SCOPE_REVIEW.md)） |
| TypeScriptのoverload／専用型、JavaScript、deep import | 専用overload／宣言依存を除く判断、JSの受付拒否、専用moduleの解決失敗は別。変数経由等では型が余剰keyを捕捉するとは限らない | 旧利用側の実解決版・entry／moduleと呼出し形、直接／再export／別名／動的参照、型だけ／実行時の区別。候補側は固定したJS／宣言／両mapと実解決を別照合。正常moduleの欠落や型エラーだけで合格にしない |

## 3 影響証拠の範囲・受入条件

| 証拠層 | 最小の記録と使える範囲 | 欠ける場合 |
|---|---|---|
| 現行source・旧試験（H） | 読取り基準、参照箇所、旧入力と既存assertion、同期失敗／Promise返却の境目を記録。Hは仕様差の比較根拠で、外部callerの存在・不在や候補動作を示さない | 実配布版との対応がなければ旧配布物での結果と断定しない。旧試験の期待値は維持 |
| 外部利用の範囲（別承認後のみ） | 許可された資料に限り、対象版の由来、実際に解決したentry／module、利用箇所の秘匿化した参照、`synthetic_io` の到達、例外・返却・後始末依存、未調査範囲を一件ずつ記録。告知だけで足りるか否かではなく、止まる処理・影響・引受先を区別する | 検索に出ない、報告がない、資料が取れないことは「利用なし」ではない。定義した範囲での未観測と範囲外／未確認を分け、全体Unknownを維持。連絡先、秘密、入力本文・ログ原文は証拠として収集しない方針 |
| 候補の仕様差・通常維持（別承認後のみ） | [G03の段階別pin](BEST_PRACTICE_RELEASE_AP05_G03_CANDIDATE_PIN_DESIGN.md)と同候補の実解決に結び、禁止own keyの同期code・Promise非返却・旧分岐未到達、通常の同期summaryとK02〜04の実bind・停止／解放、型／import差を独立に照合。[G04](BEST_PRACTICE_RELEASE_AP05_G04_EXECUTION_CUSTODY_DESIGN.md)の終了四軸・post-pinと結果を分ける | Pの入口拒否、正常load、通常経路の正対照、旧保証の欠失対照は相互に代用しない。候補側の観測が成功しても外部利用実態は確定せず、逆に外部利用未観測で候補検証を省略しない |

証拠欄は「対象版・実解決先／入手元／呼出し形／確認した結果と影響／範囲外・未確認／引受役割」に分ける。採取・観測・保全の方法はここでは選ばない。影響や責務を説明できなければ非提供決裁に進めず、適格な登録結合欠失対照が見つからないことも受容理由にしない。

## 4 外部説明案（承認・公開前。版・日付は未定）

下記は対象範囲・候補の検証と個別決裁が揃った場合にだけ使う文案。現行の挙動変更、公開予定、提供開始を知らせるものではない。

> **旧合成入力 `synthetic_io` の取り扱い変更（案）**
>
> この変更を適用した版では、`prepareNewReviewComposition` の `options` 自体に `synthetic_io` を含める呼び出しを受け付けません。値を `undefined` にしても省略にはなりません。対象の呼び出しはその場で `BoundedReadError`（`code: invalid_input`）を同期的に投げます。旧合成処理は開始されず、`prepared_only` で成功するPromiseも、後段エラーで拒否されるPromiseも返りません。
>
> 呼び出しが同期的に例外を投げると戻り値がないため、直接つないだ `.catch()` や `.finally()` は実行されません。該当の呼び出しがある場合は、呼び出し自体を含む `try`／`catch` と、利用側で必要な後始末の位置をご確認ください。これは例外の扱いの違いを説明するもので、旧合成処理を継続する方法ではありません。
>
> `synthetic_io` を使わない、許可された通常の呼び出しについては、従来の同期返却を維持する方針です。旧キーを外すだけでは、旧合成処理やその後段の結果は得られません。

旧宣言や専用moduleに触れる追記は、対象版・対象名・実解決の差が確定してから別文にする。「外部利用なし」「影響なし」「移行完了」「旧保証と同等」「正式発行可能」とは書かない。外部説明のレビューと候補の受入・保証低下の受容は別判断。

## 5 個別票に渡す条件と起動0

旧試験担当はHの維持、通常ownerはK02〜04と解放、配布審査は候補pinと型／実行の境界、外部説明担当は影響・結果差と未確認範囲を受け持つ案。人・期日・許容影響は未確定。[AP01残差台帳](BEST_PRACTICE_RELEASE_AP01_INDIVIDUAL_APPROVAL_RESIDUAL_LEDGER.md)のA1-P05〜10に引受・回復・外部説明・個別承認を分けて渡す。AP02実装／friend撤去、AP04結果差の受容、AP05候補検証と旧試験切替、AP06公開は個別の権限であり、この文案によって承認しない。

[候補入場条件](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_ADMISSION_DESIGN.md)を変更しない。候補・必要な証拠や当該段の許可がない場合は起動しない。**現時点では外部利用の実態はUnknown、ED06は未選択・未承認、旧試験・閉鎖条件・調査保留を維持し、G02未充足、SL01起動0。外部説明は未公開。**
