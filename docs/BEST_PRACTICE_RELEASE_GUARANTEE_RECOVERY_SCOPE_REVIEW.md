# リリース準備：未代替保証の回復・非提供範囲・互換変更レビュー案

Version: release-guarantee-recovery-scope-review-draft-0.1 / Date: 2026-11-16。
Status: **静的レビュー案。振分けは推奨で、保証低下・非提供範囲・互換変更・撤去・公開は未承認。** 旧試験・期待値、通常経路未切替、正式発行口閉鎖、C実行入口／body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。LOAD6／LOAD7の選択も未承認。実装・試験変更・発行・claim消費・負荷採取・試験再実行・実process対照・実接続・実通信・実機操作・設定変更・コミット・公開・Pushは行わない。

## 1 今回の判断対象と推奨

基準HEADは`bcc932d01695dc077e819d6ff605fb8443010cec`。[case別台帳](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md)の176旧行・52入力variantと、[保証整理](BEST_PRACTICE_RELEASE_FRIEND_TEST_GUARANTEE_REVIEW.md)RG02の間を具体化する。caseの分類・件数・実行結果は変更しない。

推奨は、**既存の通常本番経路の保証を維持し、閉鎖中のfake専用laneの機能・実class連続保証は将来対応として分離する限定公開案**である。ただし採用は未承認。friendを配布に残してよいという案でも、新機能を有効化する案でもない。通常本番経路の退行がないこと、試験保証低下の個別承認、配布物からの閉包撤去と負の対照、候補commitの最終検証がすべて必要である。

「非提供」は動作・入口の範囲であり、「未確認」は保証の状態である。両者を置き換えない。配布sourceに入口が残っている現在を、文書だけで非提供・撤去済みと扱わない。深いimportを含む外部利用者の有無も今回の静的読取りでは確定しない。

## 2 通常経路との境界を再確認した証拠

| ID | 現行source／試験 | 読み取れる事実と限界 |
|---|---|---|
| EV01 | [client](../src/servicenow/client.ts)、[adapter](../src/review/update-set-adapter.ts) | clientがsnapshotからsessionを生成し、adapterは通常constructorのsource→readParent→resolveReleaseを使う。`prepareNewReviewComposition`経由ではない。この読取りだけで配布物の全推移依存・動的入口不在を証明しない |
| EV02 | [session](../src/servicenow/bounded-read.ts) | compositionの省略時経路は生成・初期source結合・予約返却・closeまででdispatch不可。`synthetic_io`経路、status／native friendは別branchだが、`#openComposition`等の共通部分を持つため一括削除は不可 |
| EV03 | [source](../src/review/bounded-source.ts)、[source binding試験](../tests/review/source-release-binding.test.ts) | 通常sourceのReleasePermit・不変release snapshot・同session bindingと取消／close後拒否は既に別の試験に存在する。新しい正式証拠発行口が閉じていることと、この既存Permitの存在を混同しない |
| EV04 | [operator fallback試験](../tests/review/operator-release-fallback.test.ts)、[release gate試験](../tests/review/release-gate.test.ts) | 既存C方式は有効な設定・binding・寿命等の条件で観測不能時にassertionを扱う。設定なし／認証失敗／不正行等は別条件。新status用fallbackの有効化とは別で、fake transcriptの200限定guardを通常source全体へ誤適用しない |
| EV05 | [canonical session試験](../tests/review/canonical-session-migration.test.ts)、[adapter試験](../tests/review/update-set-adapter.test.ts) | 通常C/G/P、retry、final予約、停止・出力・cleanupの試験がある。試験の存在を今回の成功・全経路網羅としない。旧fake private連続試験の削除許可にもならない |

## 3 保証ごとの処遇案

「維持必須」は本案の公開前条件。「限定公開では延期候補」はそのlaneを提供せず、実class保証が失われることを別途承認する場合に限る。「回復」は新friend追加ではなく、既存通常I/O境界の正対照、固定kernel／開発root分離、または将来の固定本番経路の設計で行う。実通信を行わないfake試験でも確認できる範囲と、実認証・実発行の未確認範囲を分ける。

| ID | 保証／対象 | 推奨する処遇案 | 公開・移行前の確認／未代替部分 |
|---|---|---|---|
| RV01 | factory・最初のshell・部分rollback・失敗copy・first reason／run診断分離 | 維持必須 | GT01／ETの実classとcompiled保証を残す。ND-01のnative未生成時copyはこの正常factory保証と区別し、friend撤去を理由にfactoryの故障試験を消さない |
| RV02 | 省略時compositionの初期source／claim・同lease・C=0・close | 維持必須 | GT02／KEEPを残す。fake branchと共有する`#openComposition`・source生成を切る際も、transport claim／予約返却・固定summaryを維持し、dispatchへ接続しない |
| RV03 | 通常sourceの同session／ReleasePermit／不変snapshot・混入拒否 | 維持必須 | EV03・通常release gateで正／負対照を維持。別source・同値copy・別session・再binding・close後の拒否を残す。PC-03全体が未代替という表現で、既存Permit保証まで欠落扱いしない |
| RV04 | 認証snapshot・元起点／全deadline・単一予算・final予約・admission | 維持必須 | 通常client／session・EV05の実class回帰を維持。per-user／cached／exchangeの実snapshot分岐とDのauth指定を同一視しない。第二の予算・clock・予約・枠を導入しない |
| RV05 | 通常source／worker／0.2・0.3出力・legacy release／C方式・取消と終了 | 維持必須 | SP25・EV01／04／05の通常経路を残す。source／worker実装や結果schemaは今回差し替えない。既存unknown／mismatchedの出力と、fake preparedの拒否は別契約 |
| RV06 | PC-01／02のうち閉鎖status／native laneの同実constructor・ready世代・同core／source | 限定公開では延期候補 | Dの別brand成功では回復しない。このlaneを本番提供するなら、固定本番生成・同一性・偽ready／bind hook拒否の回復を先行必須とする。限定案では未確認・非提供候補を明示し、旧実class連続保証低下を個別承認する |
| RV07 | PC-03のうちfake200 private ack→legacy判断→preparedの連続性 | 限定公開では延期候補 | 会計・値比較をDで補完し、実source準備・Permit連結の代替にはしない。RV03／05の通常Permit・C方式は維持。既存の実class fake laneを廃止する互換変更とcoverage低下が未承認 |
| RV08 | PC-04の閉鎖native／status消費・draft後失効・return→外側close・上位診断 | 限定公開では延期候補 | 正常cleanupとrun失効、HTTP／cleanup／上位理由を混ぜない。Dのwithheldで旧caller rejectを代替しない。通常RV01／04／05の同期停止・解放は延期不可。将来このlaneを提供する前に同位置の回復が必要 |
| RV09 | SP01〜24の実field・元pin・全L projection照合 | fake専用連続性は延期候補、通常clock契約は維持 | getter・startedAt・policyを通常adapterでも使うため、一括削除しない。通常のprovider pin／全L／期限はRV04／05で維持。Dのcontext検査は元実fieldの照合の代替でない |
| RV10 | OU／CRの同bytes・guard後UTC・空200のO・receipt／候補受理 | fake専用連続性は延期候補、純粋契約は補完 | Dへobserved_atを事前供給する試験では採取位置・clock回数・元source receiptを回復しない。通常sourceのUTC採取挙動は差し替えず、新しい空200採取を本番へ一般化しない |
| RV11 | THの同accepted→上位時刻移譲・sourceClosed／discard・全post-O故障sweep | 限定公開では延期候補 | 上位時刻owner／worker jobへの本番接続を提供しない案。Dの最終cleanup後withheldと旧THのrejectは非同等。将来の本番提供前に同run／source／budgetとT_i／E整合を回復する。sweepを単一faultで代替しない |
| RV12 | 旧ND単体のissuer・consumer・同reader cleanup・故障と診断 | D／純粋側の保証回復を先行 | 旧実装とST cleanupは非共有。issue／pre／postの取消・等号・再入・clock、timer異常、provenanceとseal等の未対応を、同位置の移行または明示した差分としてレビューする。import時friend取得を切ってからでも純粋／注入試験が動くことをB-03で確認。単体保証まで一括放棄しない |
| RV13 | friend取得・synthetic overload・constructor callback／推測key境界 | 意図的な入口削除案、個別承認必須 | 初回からexport／登録本体が存在しないこと、synthetic入力の副作用前拒否へ変更。無効secret・隠しsymbol・環境変数・互換shimで残さない。元の入力拒否case成功と不在化を同じ実績に数えない |
| RV14 | 本番／開発compiled・依存閉包・梱包正／負対照 | 回復・追加が必須 | PK01〜03の旧friend fixture・fake I/O同梱期待を分離。JS／宣言／map／dynamic edgeと空build／実tarballを確認する計画とし、runtime依存欠落による失敗を不在成功にしない。現行pack成功から撤去済みと推定しない |

## 4 case台帳との対応（228行の責務先）

以下は責務の振分けであり、caseの同等性判定を更新しない。範囲は両端を含み、旧176＋後続52の各行を一度ずつ主分類する。複数RVへの結合は責務の共有で、同じcaseの成功数を増やさない。旧表のKEEP／US／EK／ETの148行とFR6行は別の維持／入口仕様変更責務として残る。

| ID | 台帳の行範囲 | 主な責務先 |
|---|---|---|
| MP01 | [SA-01〜24](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-01) | RV06／08、通常の会計・入力制約はRV04を維持 |
| MP02 | [SA-25〜26](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-25) | RV13 |
| MP03 | [SAB-01〜11](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sab-01) | RV06／08 |
| MP04 | [ND-01](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-01) | RV01のfactory維持とRV06のnative未生成連続性を分離 |
| MP05 | [ND-02〜29](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-02) | RV06／08／12、通常予算はRV04を維持 |
| MP06 | [ND-30](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-30) | RV13 |
| MP07 | [NDB-01〜08](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ndb-01) | RV06／08 |
| MP08 | [ACK-01〜33](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-01) | RV07、通常source／Permit／authはRV03〜05を維持 |
| MP09 | [ACK-34〜36](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-34) | RV13、通常source同一性はRV03を維持 |
| MP10 | [ACK-37](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-37) | RV07、通常の期限／費目はRV04を維持 |
| MP11 | [ACKB-01〜02](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ackb-01) | RV07、通常のHTTP判断・C方式はRV05を維持 |
| MP12 | [UN-01〜62](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-un-01) | RV12 |
| MP13 | [SP01〜24](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#sp01) | RV09、通常のpin／clockはRV04を維持 |
| MP14 | [SP25](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#sp25) | RV05（元本番caseの維持） |
| MP15 | [OU01〜16](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#ou01) | RV10 |
| MP16 | [CR01〜03とCR05](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#cr01) | RV10、通常の停止／解放はRV04を維持 |
| MP17 | [CR04](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#cr04) | RV13 |
| MP18 | [TH01〜06](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#th01) | RV11 |

## 5 互換性・旧試験の処遇の承認項目

| ID | 変更候補 | 維持すべきもの／承認前に行わないこと |
|---|---|---|
| AP01 | RV06〜11の限定非提供案と失う実class保証 | 対象lane・未代替case・将来回復条件・release notesの制限を個別に承認する。非提供にしたので安全／移行完了と主張しない |
| AP02 | RV13の2つのfriend取得関数・登録slot・fake orchestration撤去 | 全閉包とsource callback／claim helperのfake用途を確認し、別名・shim・動的復元を残さない。通常のsource生成・Permit・fetch注入は維持する |
| AP03 | `synthetic_io` overload削除・入力拒否・返却契約変更 | 現在はPromiseのprepared summaryへ入るが、削除後は副作用前の固定invalid_inputとする既存EF-03案。同期throw／Promise拒否の差、型・deep import利用者への影響を明記し、今回仕様確定しない |
| AP04 | 元callerのrejectとDのunknown／withheld | 値draftのok=trueをreview開始・Permit・実証拠へ昇格しない。通常adapterのunknown／mismatched結果は既存契約のまま。旧試験の期待値を緩めない |
| AP05 | 旧case／fixtureを新artifactへ移す時期・残す故障条件 | 元ID・revision・fault位置・assertion・残差・新artifact・実行結果を記録するまで削除／skipしない。入口不在検査への仕様変更とDへの試験移行は別集計 |
| AP06 | package公開版・互換性の扱い・最終検証／公開審査 | 既存versionや公開済みAPIの利用実態だけで破壊的変更の許否を決めない。今回npm registry・利用者調査・CIの実行状態は確認しておらず、SemVer区分・次版番号・公開可否は未決定 |

本書のAPは承認依頼の材料であり、チェック済み決定ではない。AIの推奨だけでcoverage低下・公開範囲・互換変更を承認しない。通常経路のRV01〜05と配布のRV14を保留したまま「既存機能だけなら公開可」と判定しない。

## 6 次の着手順と停止条件

1. **B-03のcompiled移行・故障条件表を具体化**する。まずRV12の純粋診断／注入cleanupとimport時friend依存、次にPK01〜03のfixtureを、本番正対照／本番不在対照／開発連続試験へ分ける。AP承認前は設計・旧試験併存の準備範囲を超えない。
2. **AP01〜05を個別レビュー・承認**する。通常sourceの維持条件と閉鎖laneの非提供条件を対にし、未確認を消さず責務先へ引き渡す。AP未承認・移行保証不足なら旧試験／friendをそのまま保持して実装前レビューへ戻る。ただし現状の配布境界を完成としない。
3. 別承認後にEF-03C／Dの閉包撤去・空build／tarball・負の対照へ進む。保証不足を埋めるために新friendやfixture台帳共有を導入しない。
4. 対象commit固定後に通常並列・compiled・隔離梱包を含む最終検証、版と公開審査を行う計画とする。通常並列3件の原因・恒久解消は未確定のままで、対象3件の元5秒期限・既定並列度は変更しない。旧compiled対照の60秒とは別件。負荷profile・process／保管操作の承認も別に残す。

- [ ] AP01：限定非提供範囲・実class保証低下と将来回復条件。
- [ ] AP02：friend／callback／claim helperの撤去範囲と通常生成の維持。
- [ ] AP03：synthetic overload削除・固定拒否・同期／非同期の互換影響。
- [ ] AP04：reject／unknown／withheldの非同等性と公開制限。
- [ ] AP05：case・fault・compiled fixtureの移行保証と旧試験の処遇。
- [ ] AP06：公開版・最終検証・品質／公開審査。

## 7 今回の検証範囲

### B-03の詳細化（2026-11-16）

[compiled移行・import分離・故障条件表draft-0.1](BEST_PRACTICE_RELEASE_B03_COMPILED_MIGRATION_FAULT_DESIGN.md)へ、RV12／14のpure／injected／bridge分離、P/U/D/I/Hのartifact、旧UN62条件の24群とfixture切替条件を分離した。同一processの非干渉を別process成功で代替せず、bridge分岐・専用build・child終了枠は未解決／未承認のgateとして保持する。AP01〜06の承認、実装・旧試験置換・撤去・試験再実行・公開は行っていない。

### 先行レビューの静的確認（5348e38時点）

現HEADの通常client／adapter／source生成、composition省略時とfake branch、通常Permit・C方式・canonical会計の試験本文を読み、台帳の責務先を静的に振り分けた。source名検索はsrc／binの直接参照確認で、配布物全閉包・外部利用者・実行到達性の完全証明ではない。3文書のローカルリンク511件・表24個、本書43行ID（EV5／RV14／MP18／AP6）、元台帳228行への範囲分割が重複・欠落0、未承認6項目・差分空白を確認した。通常adapter／wrapperのsource構築が第3引数なしで、adapterがcomposition入口を呼ばないことも静的構文／参照で照合した。製品codeの実行・試験再実行・build・梱包・依存導入・通信は行わない。実行同等性・成功件数・回復完了・撤去済みという新たな実績は追加しない。
