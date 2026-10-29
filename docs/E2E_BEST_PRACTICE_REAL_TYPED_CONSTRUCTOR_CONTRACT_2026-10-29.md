# RT-B01：constructor継続・transport claim・診断の非dispatch合成検証

Date: 2026-10-29 / Scope: 既存lifecycle＋孤立fake context／lease／source port、実class constructorの非dispatch確認。

設計：[接続差分draft-0.2 §10](BEST_PRACTICE_ABORT_SCOPE_REAL_TYPED_BINDING_DELTA_DESIGN.md#10-rt-b01constructor-transport内部contractfake依存限定)。
実装：[lifecycle](../src/servicenow/review-evidence-lifecycle.ts)、[実sessionの固定理由写像](../src/servicenow/bounded-read.ts)。
試験：[新規35件](../tests/review/real-typed-constructor-contract.test.ts)、[梱包境界fixture](../tests/review/fixtures/compiled-fixture-boundary.mjs)。

## 1. 実装した範囲

既存registerReviewEvidenceSessionの返却closure内にtransportConstructorを置き、実BoundedReadSessionでは従来の#runOwnerから外へ出さない。新しいsession採用・owner lookup・fixture登録exportやpublic methodを設けていない。registerを任意objectで呼ぶ既存機能は孤立ownerしか作らず、登録済み実sessionの再登録は引き続き拒否する。

claimはsnapshot／readonly leaseの参照・認証ready未開始・created状態・source未claim・既存C/G/P=0を検査する。観測callback前にconsumingを取り、前後の検査後だけ空の凍結handleを一つ返す。同bindingの通常重複はrefusalのみ、別snapshot／leaseの重複はbinding矛盾で停止する。失敗claimは戻さず、stop／closeではcanonical handleを同期失効する。未claimのまま停止したownerもtransport_state=revoked（claim=unclaimed）となり、後からclaimできない。

inspectPreparedは新source claimを作らず、既存inspectSourceを共通private関数として再利用する。同source／permit／port／ready世代と不変release copyを照合し、最後にtransport失効をcallbackなしで再確認する。handle・token・lease・source等をviewに含めず、dispatch=unavailable／evidence_issuance=disabledのままとする。

内部invalid_stateを固定診断へ追加した。実sessionで同期する際は既存internal_review_errorへ写像し、公開ReadFailureCode／レビューJSONの列挙値は変更しない。最初のprimaryと通常重複のrefusalは別slotで保持する。

## 2. RED→GREEN・途中の切り分け

- 最初のtracerはtransportConstructor未実装で失敗。一度だけclaimし、同ownerのhandle検査を行う固定継続を追加した。
- prepared参照のtracerはinspectPreparedが無く失敗。既存source verifierを共通private関数にし、新しい登録／source claimを作らず再利用した。
- 最初のbuildはinvalid_stateが既存の公開ReadFailureCodeに無いことを検出した。内部Codeで保持し、実sessionの既存固定エラーへの写像を追加して解消した。公開schemaやenumを広げていない。
- ready通知が無いままC=1のfake leaseを提出すると採用できる試験を再現。constructor前提として、claimの前後の観測C/G/Pがすべて0であることを追加した。すでに認証readyを開始したcontextの採用も拒否する。
- lease callbackからinspectへ再入すると、内外とも成功する試験を再現。claim／inspectionのbusyとconsumingを組み合わせ、依存の再入で成功handle／viewを公開しないようにした。
- claimed後の別snapshot／lease提出が通常重複と同じinvalid_stateになる2件を再現。真の同binding重複だけをrefusalとし、混入はevidence_binding_mismatchで要求先ownerを失効するよう分離した。

これらの拒否をテスト前提の削除・期限緩和・source verifier迂回で解消していない。

## 3. 主な観測

| 観点 | 結果 |
|---|---|
| 生成／authority | 空の凍結handle1件。一度のclaim・二度目の通常拒否で健全ownerを交換しない。dispatch／update／receipt等のoperationなし |
| 同snapshot／lease | コピー・外国参照を拒否。claim失敗後の正しい入力でも復活しない |
| 同handle | 外国／clone／Proxyを拒否。Proxy trapを実行せず、発行元ownerは不変 |
| constructor前提 | ready開始後、C/G/Pの各費目が1になった前／後観測を拒否。失敗費目を0へ戻しても再claim不可 |
| 再入・取消 | claim中の重複、inspect中の再入を拒否。claim／inspect／preparedの最終lease観測での取消後に成功を返さない |
| prepared再利用 | 同source／permit／portだけでprepared copy。既存source claimを増やさず、公開release値の後書換えはcanonical copyに反映しない |
| prepared失効 | source／permit／port混入・未生成／無効化を拒否。source verifierの最後のcallbackで取消された場合もtransport終端検査で成功を抑止 |
| 原理由保持 | cancel／close／authentication_failed、lease例外／非有限／逆行／期限切れを固定理由で保持。後続closeや再要求で上書きしない |
| 実classの境界 | constructorのfetch spy呼出し0。継続取得口なし、再登録不可。shadow propertyで別fake継続を置いてもprivate実ownerのclaimは未使用のまま |
| 秘密非出力 | handleに列挙値なし。診断・viewにsnapshot／lease／token／source／permit／依存例外本文を返さない |
| 梱包 | 実sessionに公開継続取得口がなく、既存legacy処理の前後でもtransport未claimであることを確認 |

新規35ケースはdispatchを呼ぶAPI自体を持たず、fake leaseのコピー／観測・既存のready／source binding制御だけを操作する。preparedのsource portはテスト前提であり、実BoundedUpdateSetSourceから取得した#permitや実認証を証明するものではない。実class試験のfetchは呼ばれると失敗するspyである。

## 4. 最終検証

| 確認 | 結果 |
|---|---|
| 新規RT-B01 contract試験 | 35 tests成功、RT-B01 dispatch=0 |
| 新規＋既存lifecycle／release／closed gate／parent workflow | 5 files／160 tests成功 |
| 全体 `vitest run --maxWorkers=3` | 181 files／5,504 tests成功、33.41秒 |
| `npm run build` | 成功 |
| 変更2実装module・新規試験・梱包fixtureのESLint | 成功 |
| offline package-worker smoke | production-only install・解析・集約・private境界成功、377 files |
| 関連MD相対参照先 | 5 files／85 links存在確認成功（見出しanchorの自動検証ではない） |
| `git diff --check` | 成功 |

全体回帰と梱包smokeには既存機能のfake dispatch・ローカル合成待受・既存worker試験が含まれるが、新しいRT-B01継続からはdispatchしない。外部サービス／PDIへ通信しておらず、本番設定や公開ツール登録も変更していない。RT-A01〜16の全条件を合格したという記録ではない。

### コミット対象のみの再検証

2026-10-29、HEAD（5823a48）へ今回の10ファイルだけを重ねた一時snapshotで再実行した。無関係な`.vscode/`と`CLAUDE.md`は含めていない。build・変更実装／新規試験／梱包fixtureのESLint・全体181 files／5,504 tests（40.58秒）・offline package-worker smoke（377 files）が成功した。関連5文書の相対参照85件と空白検査も成功。製品／試験の期限とRT-B01のdispatch不可を維持している。

## 5. 費目・未接続・未証明

claim成功はlease最大2観測、inspectは最大2、inspectPreparedは既存source検査を含め最大4観測・release copy1件。同binding重複claimは観測0。handle最大1とrefusal slot1、busy／claim stateを追加するが、C/G/P・予約・実timerを追加しない。物理heap・GC／秘密消去や全体work上界を証明したものではない。

実sessionのconstructorは新継続をprivate closure内へ保持するだけで、公開legacy経路からclaimしない。typed laneを固定してbootstrapを開始するcallerは未接続である。RT-B02のcanonical予算更新port・C/G/E/R台帳・用途／予約とbootstrap、RT-B03のtyped resource cleanup・同bytes candidate／ackは後工程。任意leaseがreadonly構造に一致することは実会計更新の証明ではない。

実session→sourceの正式body／選択window／payload受領物→実worker job・seal／findingの発行は未接続。fixture台帳と実sessionの台帳を共有せず、新規の署名・policy・cap・実行permitも投入していない。

正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。RT-B01の新経路のdispatch、実通信・実機操作・トークン発行・設定変更・Pushは行っていない。
