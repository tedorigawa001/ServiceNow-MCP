# EF-03B 開発rootと試験保証の移行計画

Version: br006-development-root-ef03b-draft-0.2 / Date: 2026-11-01。
Status: **B-01の独立生成root・別brand・登録／admission・固定cleanupを限定実装。source／native移行・既存試験の置換・保証変更の承認は未実施。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。**

基準：`d6412eb`。EF-03Aのconstruction kernelは既存classへ接続済み。次に作る開発assemblyは別constructor・別brand・別登録台帳を持つため、その成功を実classのprivate継続の成功へ読み替えない。[EF-03親設計](BEST_PRACTICE_ABORT_SCOPE_KERNEL_ROOT_SEPARATION_EF03_DESIGN.md)のEF-03Bを、本書の実装単位と対応表に分ける。

## 1 最小構成と依存の切り方

開発rootは`tests/support/review/ef03/`へ置く案とする。factoryは合成snapshot・boundedな固定profile・注入Response／clockから新規runだけを作り、readonly summaryだけを返す。既存session・source・core・lease・owner・consumerを採用する引数や登録関数は持たせない。class継承、runtime moduleのmock、friend取得を開発rootの実装手段にしない。

| 部品案 | 責務 | 共有／分離の条件 |
|---|---|---|
| `assembly.ts` | 新規run生成・固定順序・finallyで解放・結果freeze | 開発用constructor／brandを所有。本番classをnewせず、診断にassemblyの種別を明記 |
| `lifecycle.ts` | ready世代・transport／source claim・一度限りの消費・同期失効 | 登録Set／WeakMapは開発root専用。本番owner登録関数を呼ばない |
| `source.ts` | 親・releaseの固定private受理、非実行draft | consumer／ack／terminal台帳は同run専用。本番sourceのoptional captureを呼ばない |
| `native-workflow.ts` | 注入Responseの同reader取得・cancel／closed／releaseLock・元floorまでjoin | fault選択とprivate negative controlは開発rootだけ。公開diagnosticをterminalへ昇格しない |
| `profile.ts` | 入力のdata-only pin・有限件数／bytes／遅延上限 | 未知field・getter・proxy・共有buffer・外部callbackを明示した境界で拒否 |
| `case-runner.ts` | 固定case、独立oracle、旧caseとの対応 | live handleを返さず、成功・拒否・取消の結果と保証区分を集計 |

上表は全体の配置案。B-01ではassembly.tsだけを追加し、source／native等のfileとbuild設定はまだ作成しない。実装中に同じ状態遷移を本番／開発へ丸ごと複製する必要が出た場合は、そのままcopyせず共通化境界を再レビューする。factoryを二つにしただけでは共通kernelの保証にならない。

### 現在の依存上の注意

- [registration module](../src/servicenow/review-evidence-lifecycle.ts)にはmodule単位の`registered` WeakSetがある。同moduleの登録関数を両rootから使うことを「別台帳」と数えない。抽出するなら、私有realmを新規生成する純粋部分と本番rootのsingleton所有を対で設計し、既存ownerを採用する口を追加しない。
- [native診断module](../src/review/abort-scope-evidence-native-diagnostic.ts)はimport時に`takeNativeStatusCompositionProbe()`を呼ぶ。開発rootからこのmoduleをそのままimportしてもfriend非依存にはならない。ND-01／02の純粋診断・注入reader部分と、ND-03の旧friend起動部分を切り分ける必要がある。
- [source](../src/review/bounded-source.ts)の親schema・private consumer・実release判断は同じclassにある。開発rootが同classを使うだけでは別source brandにならない。共通の値検査／理由写像と、rootごとの参照・tokenの採用を分ける。
- EF-03Aの`recordBinding`は診断ラベルだけである。このラベルやコピーを新rootのbinding検査に使わず、同生成元のprivate参照とclaimで確認する。

## 2 保持する不変条件

本番のactive／principal台帳は本番rootに残し、従来の同時2run上限を維持する。開発rootの同時枠・principal key・登録台帳は別にし、テストの終了や失敗が本番runの枠を返却しない。開発root同士でもforeign runの台帳を変更しない。

各開発runはcanonical coreを一つだけ持ち、同leaseからclockを観測する。親／releaseのC/G/P、final予約、停止理由の所有を既存の独立oracleと照合する。元60秒・210試行を広げず、native cleanup floorで新たな起点を作らない。本番の実会計更新を検証したという主張は別に残す。

construction primaryとcommit後のrun primaryを分ける。事前abortはconstructionのcommit段階、後段の取消・HTTP失敗はrun／native層へ残す。部分生成失敗でも取得済みslotだけを固定順に解放し、unknown／解除throwはunconfirmed、first reasonは不変とする。返却summaryは解放・seal後に作り、token・consumer・snapshot・credentialsを含めない。

## 3 旧試験との対応表

件数はEF-03Aのコミット対象検証JSONから取得した既存試験の内訳であり、EF-03Bで実行した件数ではない。parameterized caseを含む。case IDは以下の群IDに旧testのfullNameを組み合わせ、新版では旧fullNameを対応metadataとして保存する。単なる順番の番号で追跡しない。

| 群ID | 旧file／件数 | 新版の行先案 | 実class保証の扱い |
|---|---|---|---|
| B-SA | [source-status-binding](../tests/review/source-status-binding.test.ts) 26件、[boundary](../tests/review/source-status-binding-boundary.test.ts) 11件 | 開発source受理・ready世代・pre／post guard・foreign／copy／二重消費 | 移行後は開発assembly保証。本番classの実consumer連続保証は未確認へ分離 |
| B-ND | [native-session-composition](../tests/review/native-session-composition.test.ts) 30件、[boundary](../tests/review/native-session-boundary.test.ts) 8件 | 新rootのnative issuer→同reader cleanup→source受理→seal | 実session／sourceの同constructor保証は継承しない。native操作の事実とブランド境界を別集計 |
| B-ACK | [private-composition-ack](../tests/review/private-composition-ack.test.ts) 37件、[boundary](../tests/review/private-composition-boundary.test.ts) 2件 | 新rootの固定200 transcript・同bytes会計・private ack | 本番private ackと既存C方式判断への接続保証は未確認へ分離。純粋release比較だけ共有可 |
| B-FRIEND | [friend試験](../tests/review/source-status-probe-friend.test.ts) 6件 | 不正profileの拒否は新rootへ。一度目取得成功／二度目拒否はEF-03C/Dの本番export不在検査へ | friend取得成功は新版の期待から廃止。6件全部を新rootの成功件数へ足さない |
| B-KEEP | [private-composition](../tests/review/private-composition.test.ts) 35件 | 省略時summary・既存owner／source結合の本番回帰として維持 | 開発rootへ移さず、現在の保証を維持 |
| B-UNIT | [native-diagnostic-workflow](../tests/review/native-diagnostic-workflow.test.ts) 62件、[source-status-acceptance](../tests/review/source-status-acceptance.test.ts) 60件 | 純粋／注入resourceの開発unit。import時friend取得を避ける配置へ整理 | 元々正式bindingの証明でない。ND-01等の同module試験も依存閉包の棚卸し対象 |
| B-EF | [construction-kernel](../tests/review/construction-kernel.test.ts) 28件、[transaction](../tests/review/construction-transaction.test.ts) 25件 | 共通kernel単体と本番class回帰のまま維持 | 開発assembly試験だけへ置換しない |

新caseの期待は旧関数の返却をコピーして作らず、親bytes長、操作回数、元clock／floor、入力別の固定理由から独立に作る。旧caseを丸ごとskip／削除して総成功数を維持する方式は禁止する。旧実class試験は新版が揃うまでは残し、撤去する段階で旧ID→新ID→失われる保証→承認状態を一覧にする。

## 4 実class側に残す保留coverage

| ID | 開発assemblyで代替できない事項 | 回復条件 |
|---|---|---|
| PC-01 | 実session／登録owner／sourceの同private生成継続 | 後続の固定本番bindingで同実classを試験 |
| PC-02 | 実認証snapshot・ready世代と元canonical coreの同一性 | 実classの通常生成経路へ固定依存を注入して検証。新friendは禁止 |
| PC-03 | 実sourceのReleasePermit・private ackとstatus終端の結合 | 固定本番source consumerの実接続後に検証 |
| PC-04 | 実session停止からnative cleanup・外側closeまでの診断保持 | 本番固定kernelとの連続試験。別rootの成功を流用しない |
| PC-05 | 選択window／payload receipt・worker jobへの正式binding | 取得証拠の正式発行工程と同時に別途検証 |

PC-01〜04は現行の合成実class試験の一部が持つ保証であり、実認証や実通信の検証済みを意味しない。PC-05は現在も未完了。EF-03Bで試験数が増えても、これらの完了数を増やさない。

## 5 buildとcompiled試験

開発rootの専用buildを設け、`tests/support/review/ef03/`を入力、別の空の出力先を使う。共通kernelをコンパイルする場合も、出力内の相対importが解決する構造を明示し、runtime importを本番distへ暗黙にfallbackさせない。現行`tsconfig.json`／npmの本番buildはこの設計作業では変更しない。

compiled試験はproduction／developmentを別プロセスで走らせる。前者は既存classの構築・通常取得・0.2／0.3・解放、後者は別assemblyの固定profile／注入readerを検証し、件数を別に報告する。開発artifactをpackへ含めず、本番からの推移import・再export・宣言／map混入はEF-03Dの負の対照で拒否する。

[compiled native](../tests/review/fixtures/compiled-native-session-composition.mjs)、[compiled source](../tests/review/fixtures/compiled-source-status-binding.mjs)、[compiled ack](../tests/review/fixtures/compiled-private-composition-ack.mjs)は新assembly用へ移行予定。本番のfriend／synthetic_ioが残る間に削除せず、EF-03Cで旧入口を撤去するcommitと依存が整合する順序を決める。

## 6 次の実装単位と承認条件

1. **B-01（限定実装済み、§7）：生成入口と独立realm**。同じconstruction kernelを使う新規root、別brand／登録／admission、固定cleanupを追加。旧試験は置換せず、実classとの状態不変・枠不変を試験する。
2. **B-02：source・会計・nativeの移行**。上表の群ごとに移し、旧caseとの対応と独立oracleを確認する。既存の大きな本番classを開発用に丸ごとcopyしない。必要な追加共通化は最小の純粋部分として別差分でレビューする。
3. **B-03：compiled・保証表の確定**。新版と本番回帰を別実行し、各caseを「維持」「別assemblyへ移行」「本番側未確認」「入口廃止検査へ変更」で確定する。

承認対象は、PC-01〜04を別rootの試験では満たせないまま切り分けること、旧friend取得成功を廃止すること、専用build出力・追加共通化の範囲である。**本書の作成やEF-03Bへの着手を、既存実class試験をすべて削除してよいという承認にはしない。** まずB-01を旧試験併存で実装する案を推奨する。

初版draft-0.1は設計のみ。後続B-01の限定実装・試験を次節に分離する。正式発行・fallback・実接続・実通信・実機操作・設定変更・Pushは行わない。

## 7 B-01 独立した生成rootの限定実装

[assembly.ts](../tests/support/review/ef03/assembly.ts)は新規factoryごとにprivate realm、登録WeakSet、live登録Set、principal Set、active数、同期生成claimを持つ。非exportのDevelopmentIdentityのprivate fieldでbrandを確認する。本番class／登録owner／source／friendをimportせず、共有するruntime関数はconstruction kernelと純粋canonical budgetの新規creatorだけ。新rootから既存本番runを採用・検索する口はない。

入力は合成principalラベル（ASCII最大64文字）、元deadlineの低減値、固定fault名のみ。依存注入はclockと合成wait境界、run optionsは標準AbortSignalだけとする。waitへ渡すのは自分のsignalであり、identity／core／owner／consumerは渡さない。rootはrunと固定件数inspectだけを返し、runはseal後のreadonly summaryだけを返す。任意session等の追加field、getter／proxy、他runのsummaryを拒否する。

一度登録したidentityを再登録せず、foreign realmを登録操作の開始前に拒否する。同期生成claimはclock等のcallbackより前に取得し、再入で第二登録を作らない。admissionは同rootで2runまで、同principalの重複を拒否する。構築試行中のlive登録は最大でactive2＋生成中1。取得しなかった枠を返却せず、失敗・終了後も元identityの登録claimは復元しない。新しいidentityによる別runは開始できる。

固定cleanupはclosed化→live登録失効→core close→外部listener除去→timer clear→controller abort→自分のadmission返却→principal参照解除→construction seal→生成claim解放。解除失敗でも後続slotを実行し、解放未確認をconfirmedへ昇格させない。事前abortはcommit段階のconstruction失敗、commit後の取消／wait失敗はrun側に残す。late waitのsettleで終了summaryを書き換えない。

B-01はconstruction-onlyでありsource受理・native reader・ready世代・ReleasePermitを実装しない。canonicalのC/G/Pは0、R予約も未実施。元60秒を低減できるが拡張はできず、期限で非協調的なwaitから停止・解放する。これをB-02のHTTP会計／final予約・native cleanupの検証へ流用しない。

既存試験はすべて残し、[新規27件](../tests/review/development-root.test.ts)を追加した。本番2枠を保持した状態、開発2枠を保持した状態、取消・各部分失敗、別realmで、実classのconstruction／run primary／会計と本番のbusy判定が不変であることを確認する。詳細は[検証記録](E2E_BEST_PRACTICE_DEVELOPMENT_ROOT_B01_2026-11-01.md)を参照。専用build・compiled保証の移行はB-03、friend撤去はEF-03Cへ残す。
