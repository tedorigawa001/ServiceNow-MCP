# AP02／03／05：入口7件の個別判断への引渡し

Version: release-entry-decision-handoff-draft-0.2 / Date: 2026-11-19。
Status: **未承認の判断材料。現行仕様・旧試験を維持。** 基準HEADは `b1b594c`。[AP01残差台帳 draft-0.14](BEST_PRACTICE_RELEASE_AP01_INDIVIDUAL_APPROVAL_RESIDUAL_LEDGER.md)で文書照合した入口7件を、[AP02／03設計](BEST_PRACTICE_RELEASE_AP02_AP03_REMOVAL_COMPATIBILITY_DESIGN.md)の撤去・互換案とAP05の旧試験／配布物の処遇へ渡す。正規228件のうち文書対応166（閉鎖lane158・入口7・通常維持1）、別gate UN62。入口7件の正規分類は全て**未対応**であり、同等移行・保証回復・個別承認は0件追加。

正式発行口・C実行入口／body起動は閉鎖、全体受付無効、通常経路未切替、Unknown、VM／監視／telemetry調査保留を維持する。LOAD6／LOAD7選択、元5秒期限・既定並列度、旧比較childと製品全体の60秒・元attempt floorは変更しない。実装・旧試験変更／再実行・設定変更・実接続・実通信・実機操作・配布／公開・コミット・Pushは行わない。

## 1 入口7件：旧assertionと3つの判断

旧assertionは元テストの観測に限定する。例外文字列と構造化code、同期throwとPromise拒否、現在のclass own property不在と撤去後のmodule／artifact不在を分ける。以下の「必要証拠」は将来の候補で、確認済みの結果ではない。

| 判断ID／正規caseと元試験 | 現行試験が確認すること | AP02 撤去境界・残す責務 | AP03 互換差・未決 | AP05 旧試験と将来の独立対照 |
|---|---|---|---|---|
| ED01／[SA-25](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-25)・[元SA](../tests/review/source-status-binding.test.ts) | 通常生成の実sessionに推測object keyでclaim=false、第3引数付きsource生成が同期にinvalid_inputを含むerrorをthrow、capture未呼出し、requests=0 | R02／03。外部claim／callback branchの除去候補。root内の初期sourceの一度結合、通常Permitを残す | C06のclaim export不在とC07の第3引数受付は別。型削除だけではJSの余剰引数拒否にならない | 旧4点保持。将来は通常2引数成功と、承認された第3引数の拒否位置・callback非実行・元session会計を対にする。DR-20は別rootなので未代替 |
| ED02／[SA-26](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-26)・[元SA](../tests/review/source-status-binding.test.ts) | wrapper静的import後、指定class own propertyなし。取得exportを呼ぶとinternal_review_errorを含む同期throw。最初の取得をこのcase内では直接assertしない | R01／06。SA取得関数・専用slot・static登録・runner・wrapper参照を一単位とし、別名再導入不可 | C06。名前付きimportのlink時失敗、namespace上の不在、旧再取得時throwは別の観測 | 旧2点とFX04／PK02の現行対照保持。将来は本番配布物での不在と通常import成功。開発artifactのsource消費成功では代替しない |
| ED03／[ND-30](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-30)・[元ND](../tests/review/native-session-composition.test.ts) | ND wrapper静的import後、指定class own propertyなし。ND取得exportの再取得時にinternal_review_errorを含む同期throw | R01／06。別のND slot／static登録・runner／driver・module評価時の取得を追う。純粋診断／無bridgeの依存分離とUN62はB-03側 | C06。SAの不在だけでND側のexport／到達辺を閉じたとしない。外部利用実態はUnknown | 旧2点とFX03／PK02を保持。Pの不在、Dのnative連続試験、U／Hの旧ND単体保証を別実績にする |
| ED04／[ACK-34](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-34)・[元ACK](../tests/review/private-composition-ack.test.ts) | keyがobject／undefined／nullの各variantでclaim=falseと第3引数付きsourceの同期invalid_input、capture未呼出し。続く既存sessionのpayload加算=1 | R02／03。外部consumer／採用口の除去と、通常sessionの会計継続を分離 | C07。3variantは**creation object内のkey**。第3引数自体がundefined／nullの境界とは別 | 旧3variantの拒否と元sessionの後続加算を保持。将来も拒否側だけでなく既存sessionへの非干渉を観測する。旧assertを全状態不変へ拡大しない |
| ED05／[ACK-35](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-35)・[元ACK](../tests/review/private-composition-ack.test.ts) | 成功を返すstatic verifierを設置しても、creation付きsourceが同期invalid_inputで拒否しcapture未呼出し | R02／03。外部verifierを採用しない。通常の固定rootの照合を消失・公開しない | C06／07。verifier／claim不在は、旧hook設置下で同じprivate検査を通って拒否したことと非同等 | 旧2点保持。将来の再露出負対照と、通常rootの初期結合同一性を別々に確認。static関数の呼出し数は元assertにない |
| ED06／[ACK-36](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-36)・[元ACK](../tests/review/private-composition-ack.test.ts) | `bindReviewReleaseSource`をno-opへ置換したsynthetic runがPromiseをcode=internal_review_errorで拒否 | R04／07。専用laneを切っても、実source／Permit／port／登録ownerの照合を成功風hookで置き換えない。通常のbind境界を一括撤去しない | C02／06／08。synthetic入口の同期拒否やDのunknown／withheldでは、bind欠失後の旧Promise拒否を回復しない（AP04も別） | 旧fault位置を保持。FX05の同fault収録を前提にせず、Pで通常の実bindingと偽成功だけでは通らない対照、旧synthetic preparedの残差を別欄に置く |
| ED07／[CR04](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#cr04)・[元CR](../tests/review/release-comparison-receipt-session.test.ts) | 推測key付きsourceが同期invalid_input、capture／observeReleaseUtc／acceptReleaseObservationが全未呼出し | R02／03。外部観測receiver／callbackを切る候補。通常sourceの観測・時刻ownerを残す | C07。第3引数拒否・非採用の仕様と、通常sourceの観測動作を分ける | 旧4点保持。将来のcallback非実行と通常の観測の正対照を対にし、Dのschema拒否を同field・同clock位置の代替にしない |

## 2 選択前に揃える必要証拠と停止条件

1. **AP03の未選択セルを先に確定する。** C07は通常2引数、明示undefined、null、false、旧creation object、getter付きobjectの「受付／同期結果／拒否位置／callback・元sessionへの影響」を分ける。引数個数で拒否する案と非undefined値を拒否する案のどちらを採るかは未決。C05の継承・Proxy・prototype、C02〜04のsynthetic own key・複合不正の理由優先、C06の型／JS named・namespace・deep importの観測も個別に判断する。開発rootでの成功や現行の型エラーだけから、外部互換性を推定しない。
2. **AP02の対象閉包を同revisionで固定する。** 定義・登録slot・static／reexport／動的参照・生成／解放責務・JS／宣言／map・通常K01〜06を結ぶ。外部claimを切ることと、通常2引数source、同session／ownerの一度結合・Permit、既存fetch・会計・停止・省略時同期summaryを残すことを同じ候補で確認する。共有経路の所有者や影響が不明ならUnknownで停止し、設定・期限で通さない。
3. **AP05の試験処遇と配布物の負対照を分離する。** [PK01〜04](BEST_PRACTICE_RELEASE_FRIEND_TEST_GUARANTEE_REVIEW.md)と[B-03のFX03〜06](BEST_PRACTICE_RELEASE_B03_COMPILED_MIGRATION_FAULT_DESIGN.md)を基準に、旧fixtureの元assertion、Pの通常正対照／到達不能確認、別artifactの連続試験を対応付ける。現行PK02は指定ファイルの除外と配布外distの旧fixtureを検査する。候補では空buildと隔離tarballを同revisionで結び、通常import成功、禁止閉包不在、別名／再export／stale JS・宣言・map混入の意図した失敗を別々に要求する。必要kernel欠落や検査未起動を不在成功にしない。旧試験削除・skip・期待値変更・梱包設定変更は別承認まで行わない。

[C07比較設計 draft-0.1](BEST_PRACTICE_RELEASE_AP03_C07_SOURCE_CONSTRUCTOR_ARGUMENT_DESIGN.md)でED01／04／05／07の第3引数と共有呼出しの影響、同期拒否・通常2引数の受入条件を分離した。ACK-34のcreation内keyのvariantを第3引数そのものには読み替えない。採用仕様・実施結果・旧試験の処遇は未決のまま、C05は別途比較する。

[AP02の撤去範囲基準 draft-0.1](BEST_PRACTICE_RELEASE_AP02_REMOVAL_SCOPE_BASELINE_DESIGN.md)に、実名の撤去境界・残す通常結合と、PK01〜03／FX03〜06の現行期待との衝突を記録した。対象patch・AP05の処遇・配布結果は未実施。入口7件の旧試験・保証分類を変更しない。

## 3 判断の記録

ED01〜07の各行に、対象revision／候補patch、AP02で切る辺と維持K契約、AP03の選択と観測差、AP05で残す元assertion・候補artifact・正負対照、残差ownerと将来回復条件、承認者／日付／除外条件を結ぶ。**候補patch・選択・実施結果・承認は未記入**。旧試験維持、AP01の保証低下受容およびAP04の結果差も別票。FR6は別索引、UN62はB-03、通常並列と最終配布判定はAP06へ残し、入口7件の文書対応で繰り上げない。

静的確認は、元テスト・正規case／参照・親文書との対応を対象とした。製品module import・friend取得、build／test／pack、実process対照、撤去後の不在証明は実施していない。 7行の正規分類・元assertion、3MDの表11・ローカル参照72・明示anchor参照22、差分空白・stage0を確認した。
