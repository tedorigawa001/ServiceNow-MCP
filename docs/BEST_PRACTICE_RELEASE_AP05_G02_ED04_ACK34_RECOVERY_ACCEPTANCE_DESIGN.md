# AP05 G02：ED04／ACK-34の回復先行案・受入条件

Version: release-ap05-g02-ed04-ack34-recovery-acceptance-draft-0.1 / Date: 2026-11-20。

Status: **設計のみ。ED04の処遇は未選択・未承認。回復は未確認、G02は未充足、SL01は起動0。候補revision・digestは未確定。数値・観測手段・保全方式・保全先は未承認。** 静的照合基準 `a57400b` は文書・現行source／旧testの読取り用で、製品候補ではない。

[ED01〜07個別処遇案・承認票](BEST_PRACTICE_RELEASE_AP05_G02_ED_INDIVIDUAL_DISPOSITION_APPROVAL_DESIGN.md)のED04／ACK-34だけを対象に、[G02旧assertion・回復条件](BEST_PRACTICE_RELEASE_AP05_G02_OLD_ASSERTION_RECOVERY_DESIGN.md)、[NS02 N2-X07](BEST_PRACTICE_RELEASE_AP01_NS02_ACK_RELEASE_GUARANTEE_REVIEW.md)、[G01のED04](BEST_PRACTICE_RELEASE_AP05_G01_ENTRY_EVIDENCE_RECONCILIATION_DESIGN.md)へ結ぶ。`53eff59` の[C05／C07採用記録](BEST_PRACTICE_RELEASE_AP03_C05_C07_COMPATIBILITY_DECISION_DESIGN.md)は入口仕様の根拠。撤去対象・実装・旧保証の処遇を承認せず、旧caseの正規分類は未対応のまま。

通常経路・旧試験／fixture・期待値・故障位置を維持する。通常経路未切替、正式発行口・C実行入口／body起動閉鎖、全体受付無効、Unknown・VM／監視／telemetry調査保留、元期限・既定並列度を維持する。今回は本MDのみ。実装・実測・試験実行・build／梱包／展開・実接続・実通信・設定変更・公開・コミット・Pushは行わない。

## 1 旧ACK-34が観測すること

[元ACK-34](../tests/review/private-composition-ack.test.ts)は通常生成済みの同じ `BoundedReadSession` で、`key` が空object・`undefined`・`null` の3 variantを順に試す。各variantで `claimPrivateCompositionSource` がfalseを返し、そのkeyを持つ**creation object全体を第3引数**に渡したsource生成が、同期に `invalid_input` を含むerrorをthrowする。3 variantの後にcapture未呼出しを確認し、同じsessionで `chargePayload('x')` を呼んだ後に `stats().payload_bytes === 1` を直接確認する。`finally` でcloseするが、完了の直接assertionではない。

[現行source](../src/review/bounded-source.ts)はtruthyなcreationの`key`を読み、[現行sessionのclaim](../src/servicenow/bounded-read.ts)がfalseならcallbackの採用前に止まる。旧testはkey読取の不在、variantごとの個別callback記録、C／Gや他の全fieldの前後不変、計上前のP値、資源未生成を直接assertしていない。これらを将来観測する場合は元保証とは別欄にする。[既存FX05](../tests/review/fixtures/compiled-private-composition-ack.mjs)の正常preparedや[通常compiled会計](../tests/review/fixtures/compiled-canonical-session.mjs)の通常payload計上は、3 variant拒否後の同session会計を収録した証拠ではない。

## 2 引数境界：中のkeyと引数そのものを分ける

第1／第2引数は各対照で有効な通常session／source入力に固定する。[C07比較設計のV1〜4](BEST_PRACTICE_RELEASE_AP03_C07_SOURCE_CONSTRUCTOR_ARGUMENT_DESIGN.md)に従い、候補Pの観測は出力JSの直接newと転送（例：`Reflect.construct`）を別欄にし、実際に届いた引数個数・第3引数種別を照合する。転送側でundefinedや余剰引数を落として同じ結果に見せない。宣言は2引数契約の別判定とする。

| sourceに実際に届く入力 | 旧Hでの位置付け | Pで求めるC07-Bの結果（未確認） |
|---|---|---|
| 3引数：creation object、`key` は空object | ACK-34の1つ目。旧claim=falseと同期throw | creationの中を読まず、入口で同期 `BoundedReadError`（`code: invalid_input`）、source返却なし |
| 3引数：creation object、`key` は `undefined` | ACK-34の2つ目。引数自体はobject | 同じ固定拒否。許容する明示undefinedとは別 |
| 3引数：creation object、`key` は `null` | ACK-34の3つ目。引数自体はobject | 同じ固定拒否。`null` を省略に寄せない |
| 2引数のみ | 通常経路の基準。ACK-34の拒否variantではない | 通常生成。実sessionへの結合・通常Permit・後続利用の正対照、元の停止／closeを保つ |
| 3引数：**第3引数そのものが明示 `undefined`** | 旧testのcreation内key variantではない。現行sourceではtruthy分岐に入らない | JSでのみ2引数と同じ通常相当。実引数3個の受入を観測し、旧creation処理を行わない。宣言には第3引数を追加しない |
| 3引数：第3引数そのものが `null`／`false`／`0`／空文字 | ACK-34のvariantではない。現行のtruthy分岐とは別の互換差 | すべて固定同期拒否。truthinessで許容しない |
| 4引数以上：第3・第4がともに `undefined` の場合を含む | ACK-34のvariantではない | 個数で固定同期拒否。第4以降の値の評価をconstructor内の判定に使わない |

候補での拒否点は旧claimのfalseとは別。出力JSで、拒否対象のcreation field／getter／trapやcallbackの参照・採用、同sessionの実結合・会計／予約／dispatchへ到達しないことを独立に確認する。getter等の負対照を加えても旧3 variantに置き換えない。引数式の先行評価・class field初期化・割当て0は保証しない。型エラー、入口を呼べないだけ、export不在だけ、Promise拒否だけでは実JSの同期拒否を認めない。C06の旧claim／専用型の不在と通常moduleの正常loadはS02の配布境界で別判定し、確認用のfriendや公開採用口を作らない。

## 3 拒否後の同session会計を独立に確認する

候補の会計対照は、§2の返却／拒否の判定や許容undefinedの正対照とは別run。各負対照runの途中でsessionを取り替えず、同じsessionが拒否をまたいで利用できることを採用条件にする。正対照との比較では開始状態・入力・期限・会計条件を揃え、影響を隔離する。

| 観測点 | 将来の受入条件 | 代用不可・停止 |
|---|---|---|
| 拒否前と拒否直後 | 同じ通常sessionとその単一会計を固定し、指定の3 creation variantを拒否。後続の正規chargeを入れる**前**に、確認対象のC／G／P・予約・停止／診断を前後で照合し、拒否だけでは元sessionを閉じたり、別sessionへ所有を移したりしない | 入口の固定codeだけでは会計継続を認めない。拒否前から停止／上限に達していたrunや、別session・診断の置換で揃えた値は採用しない |
| 同sessionの後続charge | 元sessionに同じ通常API `chargePayload('x')` を一度呼び、Pが直前値から1 byteだけ増える。C／Gはこのchargeで増えず、通常の会計と終了責務が残る。1 byteは固定入力のUTF-8長で、候補の上限を定めない | 新sessionでのpayload=1、値stubや集計値だけの一致、二重計上・resetは不可。正規に計上済みの非ゼロPを持つ別の継続対照で、残高の置換・再初期化も区別する。これは元ACK-34へのassert追加ではない |
| 対照と終了 | 拒否操作をしない別の健全runでも同じ通常chargeが成立することを確認。会計とpost-pin、停止／close・解放を別証拠として、そのrunとownerに結ぶ | 後続charge成功や元testの `finally` をcleanup完了とはしない。証拠の欠落、先行理由の上書き、通常owner／会計の同一性が未確認ならUnknown、次slot起動0 |

現行sessionの `chargePayload` は有効性を検査して同じbudget writerへ渡し、[canonical budget](../src/servicenow/review-canonical-budget.ts)のpayload計上はUTF-8 byte長で行う。`stats()` はそのviewのコピーであり、同値だけではowner／coreの同一性を証明しない。候補では既存の許可された観測と通常利用で結び、実行token／lease等を公開しない。観測できない場合に設定や期限を変更して通さない。通常K01／02／04（単一会計・通常source／Permit・省略時同期summaryと初期結合／予約返却・固定close）は[AP02範囲基準](BEST_PRACTICE_RELEASE_AP02_REMOVAL_SCOPE_BASELINE_DESIGN.md)に従う。通常の実sourceまで切り替えたり、新friendで回復したことにしたりしない。

## 4 再審査への受渡しと停止条件

- **別々に記録する証拠**：Hの3 variantの元観測と同sessionのpayload=1、PのJS引数／宣言・同期拒否と正対照、Pの独立した会計継続。元case・入力／注入・判定位置・採用根拠・対象artifactを記録する。Pの入口不在やDの別rootの値成功はHで元claimが拒否した保証の代替ではない。
- **責務と許可**：source／session ownerはC07境界と通常結合、canonical accounting ownerは元sessionの会計・停止と解放、AP05旧試験担当は元位置・期待値の保持。人の担当・期限は未割当。候補を[段階別pin](BEST_PRACTICE_RELEASE_AP05_G03_CANDIDATE_PIN_DESIGN.md)、終端と未確認時の保全を[G04](BEST_PRACTICE_RELEASE_AP05_G04_EXECUTION_CUSTODY_DESIGN.md)に結ぶが、候補revision・digestは未確定、数値・観測手段・保全方式・保全先は未承認。個別処遇、AP02実装、候補検証、旧試験切替は別承認。
- 3層の証拠のいずれかが不足する、通常会計を同sessionで維持できない、または実施方法が未承認なら、元保証を回復済みにせず審査保留。**ED04の処遇は未選択・未承認、G02は未充足、SL01は起動0**のままとする。
