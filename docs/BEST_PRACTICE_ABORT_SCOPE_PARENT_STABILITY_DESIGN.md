# AU-BR-006：親レコードprivate snapshot・初回／最終安定性の詳細設計

Version: br006-parent-stability-draft-0.4 / Date: 2026-10-29。
Status: **§13でCD-03／04の注入Response・ReadState・初回／final slot・private workflow ownerをfake依存で接続。実sourceへの接続と正式snapshot発行は未実施。正式発行口閉鎖・Unknown・全体受付無効を維持する**。

親：[CD-01〜CD-04の固定dispatcher設計](BEST_PRACTICE_ABORT_SCOPE_CLOSED_DISPATCH_SIGNAL_DESIGN.md)、[session／transport／body境界](BEST_PRACTICE_ABORT_SCOPE_SESSION_TRANSPORT_BODY_BINDING_DESIGN.md)。
参照：[共通run owner](BEST_PRACTICE_ABORT_SCOPE_RUN_OWNER_BINDING_DESIGN.md)、[選択window／payload受領物](BEST_PRACTICE_ABORT_SCOPE_REAL_SESSION_RECEIPTS_DESIGN.md)、[CD-03検証](E2E_BEST_PRACTICE_CLOSED_RESPONSE_READER_2026-10-28.md)、[CD-04検証](E2E_BEST_PRACTICE_CLOSED_HTTP_STATUS_2026-10-28.md)。

## 1. 現状と差分

[body lane](../src/review/abort-scope-evidence-closed-body-candidate.ts)の既存projectionなし経路の対象ID付きparent解析は、strictな5列schemaと要求sys_id一致を検査する。private bytesから課金・digest・JSON解析を行い、最後は本文参照を捨てて固定summaryだけを返す。このsummaryからstate等を復元したり、初回／最終が同じrecord世代だったと証明したりすることはできない。§12の新規fake限定経路は、summaryを変更せずprivate継続を追加する。

[closed supervisor](../src/review/abort-scope-evidence-closed-attempt-supervisor.ts)はinitial／finalを同URL／fixture auth context・所定slotへ結び、§13で5列の初回／最終比較をfake依存に限り接続した。[本番bounded-source](../src/review/bounded-source.ts)のreadParent／verifyには既存の親保存と比較があるが、これは実source／ReleasePermit／metadata検証を含む別経路。verifyは不一致を例外にせず`consistency:'changed'`を返し、[update-set-adapter](../src/review/update-set-adapter.ts)は`provisional_results`／`changed_during_review`を記録して暫定結果を返す（run停止ではない）。本設計で差し替えず、閉鎖fixtureの結果をそこへ登録しない。

本設計は、既存の単一受信・単一解析から**内部だけの親snapshotを生成し、同workflowで一度比較する**ためのもの。比較対象はparentだけで、metadata／payload／ルール結果／Update Set全体の整合性まで認定しない。

## 2. 維持する不変条件

1. snapshotは同attemptのprivate bytesを解析した固定継続だけが作る。返却row・summary・hash・caller JSONからの再登録、汎用issuer／setter／getterは追加しない。
2. HTTP 200、所有・live・時刻、EOF／cleanup、schema、要求ID、最終checkpointが全て成立して初めて受理する。transport上の成功だけでは初回baselineを有効にしない。
3. 同constructorのworkflow／core／budget／target／固定descriptor／fixture auth contextへ参照結合する。コピーや同値IDだけで外国snapshotを採用しない。
4. 初回と最終のrequest／attemptは別物である。それぞれのroleと発行元を検査し、同attempt参照であることを要求しない。一方、owner／budget／target／contextは同じでなければならない。
5. 比較に失敗してもbaselineを最終値へ置き換えず、run／時刻／claimを作り直さない。retryは既存HTTP／timeout規則の同logical read最大2試行だけ。
6. stable_observationは2時点の親観測が一致したことだけ。DB lock、transaction snapshot、観測間の無変更、読取ACL、実認証、正式source証拠を意味しない。

## 3. 保護入力とprivate型（提案）

型名は当初の設計案で、既存exportと同じとは限らない。§11の初期実装はpackage除外の独立した合成issuer内だけで、実parser／transportの発行継続ではない。

| 内部型／owner | 生成・binding | 所有権・権限 |
|---|---|---|
| ParentWorkflowOwner | 同constructorがcoreとともに一度生成 | 初回baseline、final利用claim、診断、live世代を唯一所有。外部ownerの採用口なし |
| ParentParseDraft | 同body candidateの一度限りconsume継続 | strict解析後の5列とprivate発行元。最終guard前は未受理、status・worker・callerへ返さない |
| InitialParentSnapshot | 初回の固定受理継続 | 初回request／成功attempt・同owner／budget／target／contextへ結合。immutable、baselineとして1件だけ保持 |
| FinalParentObservation | 同final logical readの固定受理継続 | 所定final slot・request／成功attemptを記録。比較へ一度だけ移譲し、別runや初回roleとして使用不可 |
| ParentCompareDraft | 同owner内の固定比較器 | field一致／差分名だけを仮置き。最終checkpointが成功するまで安定性を確定しない |
| ParentConsistencyDiagnostic | 同ownerの固定終端処理 | 固定state／code・差分field名のみ。raw値・URL・対象ID・body・authを保持／公開しない |

snapshotのデータは凍結した5つのprimitive stringに射影し、JSON全体・Response・reader・headers・raw bytes・callbackを保持しない。発行元の認証にはprivate台帳／所有関係を使い、TypeScript brand・Object.freeze・hashだけをauthorityとしない。

現在のdispatcher authContextはfixture identityであり、closed gate内の認証identityや実AuthSnapshotIdentity／ready世代と同一だと認定済みではない。本段階で結合するのは**同じ閉鎖composition由来の参照**まで。実session／sourceへの接続時は既存の正式issuer・ReleasePermit bindingへ別途結ぶ。bootstrapの初回親GETに、まだ存在しないmatched permitを要求する循環も作らない。

## 4. 比較項目と正規化しない方針

本番parentSchema／CD-03のstrict 5列schemaを維持し、初回／最終の両方に適用する。余剰列・欠落列・型不一致を捨てて比較続行せずinvalid_responseとする。

| field | 受付条件（現行互換） | 比較 |
|---|---|---|
| sys_id | 小文字hex32桁、constructorで固定した対象IDと一致 | 同じ対象であることを双方で検査。不一致はchangedではなくinvalid_response |
| state | string、最大100 code units | 完全一致。空文字を勝手に補完しない。状態の業務的な許可判定は別 |
| application | string、最大32 code units | 完全一致。空文字／global／sys_id風の値を同一視せず、scope情報へ昇格しない |
| sys_updated_on | 非空string、最大40 code units | 完全一致。Date.parse・timezone変換・trimはしない |
| sys_mod_count | 1〜20桁の数字string | 完全一致。Numberへ変換せず、精度損失・先頭ゼロの同一視を避ける |

sys_updated_onだけ、またはsys_mod_countだけが違ってもchanged。state／applicationが違えば更新世代が同じでもchanged。カウンターの増減や時刻の新旧を推測せず、巻戻りも含め不一致は全て不安定とする。

比較は固定順の5 fieldを明示的に行う。JSON key順・空白・chunk分割・本文長・digestの違いは、5列が同じならchangedの根拠にしない。raw bytesのhashは診断用で、snapshot identityや意味比較の代用品ではない。

## 5. 生成・commit順序

1. 固定factoryのconstructorで、workflow owner・診断slot・初回／最終claimを同coreへ結ぶ。getterや外部callbackで後から交換できないようにする。
2. 初回logical readを一度開始する。HTTP／timeout retryは同read内で行い、失敗attemptからsnapshotを作らない。
3. 同private candidateを一度consumeし、既存のJSON解析の中で5列を検査してParentParseDraftへ射影する。summaryからの復元・2回目のJSON.parse・追加GETはしない。
4. EOF／cleanup証拠、owner／request／attempt／role／target／context、live、元のphase／attempt期限を再検査する。最後の成功guardの後、同じ同期継続で初回snapshotをcommitする。前段でdraftが作れても、後段のguard失敗なら破棄する。
5. final開始前に独立した「初回snapshot受理済み」を検査し、final workflow claimを一度消費する。その後に所定slotでfinal logical readへ進む。transportのinitial成功mapだけを根拠にしない。
6. finalも同じ経路でprivate observationを生成し、同ownerの初回snapshotと比較する。final retryは同logical read／slot内だけで、新しいfinal claimを作らない。
7. 比較結果をdraftへ置き、元の時計・停止・identityを再検査する。成功した固定同期継続で一度だけstable_observationまたはchangedを確定し、両方のrecord参照を破棄する。

publicなbody.consumeの結果へrecordを追加したり、任意のonParsed(row) callbackを渡したりしない。新しい固定parent-consume継続は閉鎖core／body laneの内部接続へ限定する。既存の汎用summary入口・CD-01／CD-02／stream-onlyを、本番snapshotの発行元として扱わない。

### 5.1 現行の成功判定との関係

現行body.finishは解析前にtransport側をsettleし、parent_initial成功をReadStateへ記録できる。その後にparseや最終guardが失敗すればrunは停止するが、このmapだけでは新snapshotの受理証拠に足りない。

したがってParentWorkflowOwner自身が、最終guardを通過した初回snapshotの受理状態を別に所有する。finalの入口でReadStateの順序・slot条件とownerの受理状態を両方要求する。将来の実装でguardの中から早期sink callbackを呼び、後段で停止してもsnapshotが残る構造を採らない。

async readの返却後に起きた取消との関係はcommit時点をlinearization pointとする。commit前の取消／期限切れなら成功を出さない。commit後の停止では観測診断を履歴として保持できるがlive権限を失効し、後続の証拠発行／利用には毎回有効性検査を要求する。Promiseがcallerへ届いたこと自体を利用権限にしない。

## 6. workflow状態と一度限りの消費

| 状態 | 許可する進行 | 拒否／停止 |
|---|---|---|
| new | 初回logical readの開始 | final・比較・外国handle |
| initial_pending | 同logical readの既存retry、またはsnapshot受理 | 二重初回、未受理のままfinal、別attemptのdraft混入 |
| initial_observed | final workflow claimを一度消費 | 初回再取得・baseline差替え |
| final_pending | 同final logical readの既存retry、または固定比較 | 新final生成、比較二重開始、別slot／owner混入 |
| comparison_pending | 比較draft（差分field名のみ、両record破棄済み）の最終guard後の一度限りの確定 | 二重確定・record再参照・未確定のままstable／changedとして利用 |
| stable_observation | 診断参照だけ | 再比較・snapshot持出し・未承認の正式発行 |
| changed | 固定診断を保持しrun停止（閉鎖経路のfail-closed選択。§7） | baseline更新・最終値への置換・自動再読による救済 |
| not_verified／revoked | 固定理由を保持し参照破棄 | 再準備・復活・retry権限の再発行 |

pendingはlogical readの進行を表し、HTTP attemptが常にactiveという意味ではない。cleanup確認済みtransientで次attemptを待つ間も同logical readに属する。final開始claimと各attempt claimは別であり、transport retryによって前者を二重消費しない。

baselineやfinal draftを別ownerへ渡すテスト用の本番登録口を作らない。foreign handleは自owner側で拒否し、外国ownerのclaim・診断・参照を変更しない。自owner内のbinding矛盾・二重消費は、そのownerを停止し再利用不能にする。

## 7. 失敗分類・停止・診断

比較差分と取得／証拠不足を区別する。既存の本番bounded-source.verifyのconsistency返却は変更しない。§13で`changed_during_review`を合成closed gate／ReadStateの固定停止理由にも追加したが、公開レビューJSON契約や本番の停止語彙は変更しない。

本番との写像：stable_observationは本番`stable_observation`、changedは本番`changed`（暫定結果＋`changed_during_review`）、not_verifiedは本番`unverified`（`consistency_unverified`）に対応する。本番はchangedを正当な観測結果として暫定結果まで返すが、閉鎖経路は正式発行口を閉じたまま観測を証拠へ昇格しないため、changedでもrunを停止するfail-closedを選ぶ。将来本番へ接続するときは、この停止をchanged＝失敗と読み替えず、本番の暫定結果の扱いに合わせて再設計する。

| 事象 | workflowの結論 | 停止／診断方針 |
|---|---|---|
| 有効な5列のstate／application／更新世代が不一致 | changed | 既存語彙`changed_during_review`を閉鎖gate内部codeとして再利用しrun停止。新しい別名は作らない。再取得しない |
| 対象ID不一致、欠落／余剰列、型・schema不正 | not_verified | 既存invalid_response。changedと採点しない |
| 同owner／budget／role／slot等のbinding不一致 | not_verified | evidence_binding_mismatch。外国ownerは操作しない |
| 二重開始・二重consume・順序違反 | not_verified | invalid_state。claimは戻さない |
| finalを取得できない／HTTP retry上限／予算不足 | not_verified | 既存HTTP／予算理由を保持。final欠落をstableにしない |
| cancel／close／phase・全体・attempt期限、clock失敗 | not_verified／revoked | 既存の最初の停止codeを優先し、参照を同期失効 |
| cleanup未確認 | not_verified | 既存primary・attempt／HTTP診断と別にcleanupを保持。snapshotを受理しない |

changed_fieldsは固定順のfield名だけを最大5件保持する。sys_idの不一致は受付段階で拒否するため、通常の意味差分は残り4 field。初回／最終の値、差分値、対象ID、URL、auth context、raw errorは出さない。件数だけで十分な公開境界にはfield名も渡さない。

比較処理を開始する前に停止していれば既存primaryを保持し、changed_during_reviewで上書きしない。compare draft作成後の最終guardでcancel／期限切れを検出した場合も、stable／changedのcommitをせずnot_verified／revokedにする。changed確定後はその診断をlate応答やcloseで消さず、resource解放の状態とは別軸に保つ。

安定性診断と停止の確定は同owner内の固定sectionで行う。任意callerがconsistency=stable_observationを申告して受付を継続する口や、digestだけを再提出する比較口は設けない。

## 8. 所有権・寿命・費目

初回snapshotは受理から最終比較／停止／closeまで。final observationは最終受理から固定比較の終了までだけ保持する。設計上の保持record数は初回1件＋final draft／observation1件の最大2件とし、初回／最終それぞれのdraftとcommitted copyを同時に別保存しない。retry失敗はrecordを増やさず、未受理draftを破棄する。

5列の長さ上限の合計は1 record最大224 UTF-16 code units、2 record最大448。ただしJSON解析中のobject・string backing storage・engine overhead・受信bufferは別費目であり、この値を実heap byte上界と扱わない。秘密参照のdropは到達可能性を減らす操作で、JSの即時GC／物理メモリ消去を保証しない。

| 費目 | 所有者・計上方針 |
|---|---|
| HTTP C／G／S・final予約・retry | 既存の単一ReadState。snapshot生成・比較で再加算／返金しない |
| 元t0／60秒・50／55秒・attempt window・cleanup | 既存core。比較前後にもcheckpointし、比較用の新期限を作らない |
| JSON decode／strict schema／digest | 既存consumeを一度だけ使用。比較のために本文を再parse／再取得しない |
| private projection | 同consumeの固定継続。最大5 bounded stringと発行元bindingの保持費用 |
| owner／claim／比較guard | 固定owner。状態・同一性・一度限り消費の費用を追加費目として明示する |
| 意味比較 | 固定5 fieldのbounded文字列比較。順序固定・早期差分打切りの有無にかかわらず全fieldの上界で評価 |
| 解放 | 同owner。停止時の参照破棄は一度だけ、既存HTTP cleanupを二重実行しない |

追加の計算量は有限でも、既存全体work／heapモデルへ課金済みとは認定しない。実装時はprojection・guard・比較・参照破棄の費目所有と、成功／拒否／取消経路の独立計数を確認する。Rust側のwork unit等と無根拠に換算せず、本番cap／全体受付は無効のままにする。

## 9. 合成試験・独立oracleの条件

実通信を使わず、既存fake dispatcher・clock／schedulerと注入Response／Streamsで確認する。製品parser／比較器を期待値生成へ流用せず、試験側の固定5列と差分名一覧から判定する。

- 同じ5列でJSON key順・空白・chunk分割・digestが異なる場合もstable。逆に同じ更新世代でもstate／application差分はchanged。
- 各比較fieldの単独変更、複数変更、全変更と固定順のchanged_fieldsを確認する。sys_id差分はinvalid_response、他4 fieldの非空変更組合せ15通りを独立oracleで確認する。
- カウンター20桁、桁落ちが起こる値、先頭ゼロ差、時刻表記差・巻戻り、空state／applicationの同値と相違を、数値／日付／scopeへ正規化せず判定する。
- sys_idだけの本文・余剰／欠落列・型不正、別target／owner／budget／role／slot／attempt由来、コピーhandle・summary／hashの再登録を拒否する。
- 初回／最終のprivate projection発行後から最終guardまでに取消・期限切れ・clock再入を起こし、未受理draftがbaseline／stableとして残らないことを確認する。
- 初回timeout／429後の成功で、最初の成功受理からだけbaselineを作る。final transient後のretry成功でも初回baselineを再設定しない。
- final HTTP恒久失敗・retry上限・予算不足・cleanup未確認・未実行はnot_verified。changed確定後の再取得、二重final、二重比較、停止後の再準備は拒否する。
- source chunkの改変や返却summaryの改変でsnapshotが変わらないこと、停止／比較終了後にrecord参照を保持しないこと、secret sentinelがstatus／ログ／結果へ出ないことを検証する。
- 同C/G・final枠・元の時計を維持し、追加GET／2回目parse／別budgetがないこと、foreign owner不変、CD-01〜CD-04と既存MCP／梱包契約の互換を確認する。

privateな参照保持の検証方法は、内部test-only計数／状態の限定観測で具体化し、生snapshotを返すtest issuerや本番台帳操作口を追加しない。heapの実測やWeakRef／GC待ちだけで解放を証明したと扱わない。

## 10. 次の実装単位と未確認事項

1. private snapshot／draft・workflow ownerの内部型、固定5列比較器、生成・消費順序を合成issuerだけで実装する。本番issuer・実sessionは採用しない。
2. 同bytesの既存consumeから固定private projectionを供給し、最終guard後だけ初回受理／final比較へcommitする。summaryやcaller callbackへのrecord流出を拒否する。
3. CD-03／CD-04のinitial／final・停止処理へownerを接続し、安定／変更／未検証の全経路、追加費目、非露出・既存互換を検証する。

1の合成モデル実装は§11、2のfake依存限定接続は§12、3のCD-03／04接続は§13を参照。追加費目は§13で所有を示すが、全体work／heap上界へ包含済みとは認定しない。実sourceでは既存verifyが親とmetadataをまとめて評価するため、親だけの結果を全体stableとして公開しない。後続のmetadata／payload／worker binding・上位JSONへの写像は別設計とする。

draft-0.1作成時はMD整理のみ。後続の合成モデルは次節と区別する。実AuthSnapshotIdentity／ReleasePermit・固定sourceへの正式接続、本番cap・全体work／heap上界・OSの実時間終了保証は未接続／未承認。正式発行口閉鎖・Unknown・全体受付無効、VM／監視／telemetry調査保留を維持し、実通信・実機操作・token発行・設定変更・Pushは行わない。

## 11. 合成issuer限定：内部型・固定比較器・one-shot初期実装

2026-10-29追加。[実装](../src/review/abort-scope-evidence-parent-stability.ts)、[65件の合成試験](../tests/review/parent-stability-model.test.ts)、[検証記録](E2E_BEST_PRACTICE_PARENT_STABILITY_MODEL_2026-10-29.md)を参照。既存のbody lane・supervisor・本番sourceを変更せず、独立したsynthetic issuer内で生成・消費契約を検証する。

### 11.1 内部所有と状態

factoryのissueSessionは対象ID・最大60000msの**合成**deadlineからprivate Context（core／budget／auth／generationの不透明identity）を生成する。実sessionや既存Readonly leaseの登録は受け付けない。session側claimをclock検査前に消費し、claimOwnerは一度だけ。重複／失敗／close後に別ownerを作り直せない。

Owner・Use・Draft・Snapshot・Comparisonはissuer内の非export型。外へ出すのは中身のない凍結handleだけで、同issuerのprivate WeakMapによる参照検査を必須とする。initial／finalは異なるrequest・attempt・slot identityを持ち、同owner／Contextへ結合する。snapshotのrecord値を返すAPIはない。

beginInitial→issueDraft→acceptInitial→beginFinal→issueDraft→prepareComparison→commitComparisonの順序を固定する。prepareComparisonの後はcomparison_pending（§6）で、commitComparisonだけがstable_observation／changedへ確定する。draft発行・consume・比較handleの確定は一度だけ。外国handleは受信ownerを拒否し外国ownerを変えず、自ownerの消費済みhandleはinvalid_stateとする。

### 11.2 guard・比較・非露出

各操作はpre-guard→private prepare／claim消費→post-guard→固定同期commitの順。初回snapshot受理とstable／changedの確定はpost-guardの後だけで、任意callback・awaitを挟まない。clock再入・取消・期限切れでdraftができても受理しない。比較準備後は両recordを捨て、field名だけの比較draftを保持して最後に確定する。

strictな5列をown data propertyからbounded primitive projectionへコピーし、Proxy・accessor・余剰／欠落列・型不正・対象ID不一致を拒否する。5列の比較はprivate純粋関数で全fieldを固定順に完全一致検査し、Date／Number／scopeの正規化をしない。比較器自体をraw recordを受け取る公開関数としてexportしない。

changedでは本番と異なる閉鎖モデルのfail-closed選択に従いchanged_during_reviewで停止し、値を置き換えない。statusはstate／liveの最終観測・最初のprimary・field名だけのchanged_fields・有限な操作計数を返す。stable／changed確定後のcloseや後続拒否でも観測履歴を保持し、利用権限は失効する。readonly statusはclockを進めず、現時点の有効性証明ではない。

### 11.3 保持・計数と未証明の範囲

初回recordとfinal draftの保持は最大2件。比較準備・停止・closeでrecord参照を破棄し、stale handleのWeakMap entryにもrecord値を残さない。保持数は論理recordの計数であり、GC／物理消去や実heap byte上界の証明ではない。

drafts_issued／drafts_consumed／snapshots_accepted／comparisons_prepared／comparisons_committedを分離する。field_comparisonsは比較準備ごとに固定5で、後段guardが失敗しても実施した比較費用を消さない。これらは限定した操作数であり、全体work unitや費目受付へ接続したものではない。

raw JS fixtureのown key列挙前のallocation上界、Zod／engine内部費用、全体heap／workの受付は未証明。合成deadlineも操作時の検査だけで、実timer／HTTP attempt／50・55秒phase・共有C/Gへは未接続。未観測のHTTP cleanupをconfirmedと申告するAPIや、実body／sourceからの正式生成口はない。

同bytes由来projectionのfake接続は§12、CD-03／CD-04のowner停止・final slot接続は§13を参照。formal issuance／全体受付を有効化せず、Unknown・VM／監視／telemetry保留を維持する。実通信・実機操作・設定変更・Pushは行わない。

## 12. 同body bytesのprivate projection・post-guard受理（fake依存限定）

[body lane](../src/review/abort-scope-evidence-closed-body-candidate.ts)の共有内部coreへ、専用の`createSyntheticParentProjectionLane`を追加した初期段階。projectionなしfactoryと、comparison_pendingまでの既定の合成factoryを維持する。§13のCD-03／04だけが内部のfinal確定を有効にする。任意のprojector／onParsed callbackやrecord getterを追加しない。専用factoryは合成issuerを内部生成し、そのsession／owner／draft／comparison handleは返さない。

### 12.1 固定継続と所有権

1. append時にprivateコピーした同attemptのchunksを一度結合する。chunk課金は既存hookだけが所有し、projectionで再課金しない。
2. confirmed EOF・closed・lock解放を確認済みのcandidateだけを一度consumeする。同bytesからUTF-8 decode／JSON.parseを1回行い、strict envelopeと5列schema・固定target一致を検査する。hashも同bytesから計算する。
3. そのparse内の固定継続で5列を合成issuerのprivate draftへコピーする。issuer側のprimitive検査は残すが、JSONを再parseしない。summaryから復元しない。
4. body内checkpointで失敗せず、body全体guardのpost-checkが成功した後にだけ、初回はacceptInitial、最終はprepareComparisonを呼ぶ。issuer自身のpre／post-guardも同じcheckpointへ戻し、最後の時計観測で取消・期限切れになったdraftを受理しない。最後のguardとsnapshot commitの間に任意callback／awaitはない。
5. 公開結果は従来と同じ件数・bytes・digestのsummaryだけ。独立合成factoryの既定はcomparison_pendingまで。§13のCD接続だけはそのprivate比較を確定するが、正式受領物・公開レビュー結果へは昇格させない。

factoryのcheckpointはfake側の単一停止／時計を参照する。別の実budget・HTTP・認証snapshot・timerは生成しない。合成issuerの60秒上限は外側checkpointを越える権限にならず、元の取消・phase／attempt期限等が先に失敗すれば固定理由を保つ。body会計用の狭いstop契約を広げず、合成factory専用stopProjectionがsession全体の固定理由を扱う。

### 12.2 失敗・解放・診断

body guardの失敗時は残ったbytesとprivate draft／baselineを破棄し、issuerをcloseする。snapshot受理側のguard失敗も同様に外側停止へ返す。revokeはbodyとissuerの双方を失効させる。自己candidateのreplay、外国／コピーcandidate、final先行、target上書き、strict schema違反を拒否しclaimを戻さない。外国laneの状態は変更しない。

body診断には合成issuerの固定statusだけを追加する。record・対象ID・認証・URLは出さず、retained_records等の論理計数だけを保持する。body側が先に止まった場合、issuerの局所理由はclosedになり得るが、外側の元のprimaryを置き換えない。既存projectionなしlaneの診断形状は変えない。

### 12.3 費目と未接続範囲

| 費目 | 所有・検証 |
|---|---|
| chunk／受信bytes／settle | 同attemptの既存hook。retry分も累積、破棄で巻き戻さない |
| UTF-8・JSON・hash | 既存consumeの同bytes。試験でJSON.parse1回・独立hash・元buffer変更後の不変性を確認 |
| schema／projection／guard | strict5列＋issuer再検査・追加checkpoint。既存費用に包含済みと認定しない |
| private保持／比較 | 初回1・最終draftと最大2 record、比較準備で0。最終は5比較だけを計上し確定しない |

これはfake hookと合成issuerの内部接続であり、実session／ReleasePermit／正式body receiptの由来や実通信でのcleanupを証明しない。CD-03／04の注入Response read・final slot・共通primary・changed結果写像は§13で接続する。全体work／heap受付・本番capは無効、正式発行口閉鎖・Unknown・調査保留を維持する。

接続前の2課題は§13で対処した。①changed_during_review→invalid_stateの仮写像を撤去し、合成gateの元の停止理由を保持する。②ReadStateのordinary closeは終端revokeと分離し、受理済みbaselineを予約済みfinalへ残す。snapshotの時計検査にはordinary refuseを渡さず、同時計のsession／phase／保持したattempt期限だけを検査する。

検証：[同bytes projection・post-guard受理記録](E2E_BEST_PRACTICE_PARENT_BODY_PROJECTION_2026-10-29.md)。

## 13. CD-03／CD-04：private owner・停止・final slot接続（fake依存）

[40件の接続試験](../tests/review/closed-parent-workflow.test.ts)、[検証記録](E2E_BEST_PRACTICE_CLOSED_PARENT_WORKFLOW_2026-10-29.md)を参照。

### 13.1 発行元と同一性

`createInjectedClosedParentResponseReader`の固定targetを、同じprivate supervisor core→fake gate→ReadState→専用body factoryへ渡す。bodyが内部生成したworkflow ownerはこのlane専用で、snapshotやhandleの持出し・再登録を受け付けない。初回／最終のtarget・URL・fixture auth context、単一C/G台帳・停止・時計は同coreに属する。実AuthSnapshotIdentity／ReleasePermitの証明とは区別する。

同ReadStateがdispatchしたattemptの成功bodyだけをcandidateにし、その同bytesからdraftを作る。初回transport settleのsuccess mapだけではfinalを開けず、private初回snapshotが受理済みであることも要求する。破棄した初回bodyはinitial_unavailableとしてfinalをskipできるが、baselineへ昇格しない。

finalは既存のparent slotを一度openし、retryもそのlogical request／slot内の最大2試行だけ。HTTP 429／5xxのcleanup確認済み失敗ではbaselineを残し、別ownerやfinal claimを生成しない。成功した最終bodyはprepareComparison→commitComparisonへ固定接続する。一致は親だけのstable_observation診断、不一致はchanged_during_reviewで閉鎖runを停止し、追加取得・baseline差替えをしない。最終retryを使い切った場合も元のHTTP／timeout理由で停止・baseline破棄する。

slotのdoneはtransport試行・予約消費の履歴であり、単独で検証成功の証拠にはしない。初回snapshot・比較状態・acknowledgementを別に確認する。停止でidle slotはinvalidated、残予約は0になるが、既にdoneになったslotの履歴は保持する。

### 13.2 同期失効・ordinary close・時計

終端のcancel／close／認証失敗／schema不正／cleanup未確認／期限切れは同gateの最初のprimaryを保持し、ReadState経由でbody bytesとissuer内recordを同期失効する。issuerの局所closed理由が先行の外側primaryを上書きしない。stable／changed確定後の停止では観測履歴だけを残し、liveはfalseとなる。

normal取得のordinary closeは終端revokeと別操作とする。未受理のordinary body／draftは破棄する一方、受理済み初回baselineは生かし、元の50秒境界を越えた予約済みfinal観測を55秒境界までに行える。snapshot用checkpointは同gateの時計／停止・final phase期限・attempt期限を検査し、ordinary refuseをsessionの終端へ変換しない。全体60秒、phase、attempt、cleanup reserveとC/G上限は変更しない。

body consume中は同attemptのdeadlineとpending状態を、raw bytes破棄後からsnapshot／比較commitの終了まで保持する。bodyのcurrentを消したことによって期限検査や再入拒否が抜け落ちないようにする。

### 13.3 非同期返却のacknowledgement

本文受理後にもasync returnの継続があるため、private coreはその成功attemptだけを一時保持し、Readerが返す直前に一度だけ消費する。ReadStateのacknowledgeParentは同attemptの所属・settle済み・親の固定role・受理／比較状態、finalなら同parent slotのdoneを検査する。保存した同attempt windowをguardの前後で検査し、元の取消・session／phase期限も再検査する。新しい期限・GET・課金は作らない。

その間に取消・期限切れが起きたら成功summaryを返さず、元の固定停止理由を返す。snapshotやstable観測がすでにcommitされた場合は過去の観測履歴として残し、現在の権限とは扱わない。ackの二重消費・外国attemptは拒否し、外国ownerを変えない。最後のguard後からReader返却までは任意callback／awaitを挟まない。

### 13.4 費目・互換性・未対応

追加費目はprivate owner生成・固定5列projection／比較・同checkpointの追加観測、consume中の期限保持、1attemptにつき1ack claim／guardと参照破棄。C/G／payload課金・final予約は既存ReadStateだけが所有し、再課金・返金しない。全体work／heap上界への包含や本番cap受付は未証明。

CD-01、CD-02、stream-only、projectionなしfactoryと独立合成factoryの既定comparison_pendingは維持する。固定停止語彙の追加はpackage除外済みの合成module内だけで、公開JSON・MCP登録・本番sourceは変更しない。親一致をmetadata／payload／workerやUpdate Set全体のstableへ拡張しない。

実session／ReleasePermit／選択payload／worker jobとの正式binding・実通信・本番へ移す際のchangedの暫定結果写像は引き続き未接続。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry保留を維持する。

次の設計差分：[実session／ReleasePermitとtyped取得draft-0.3](BEST_PRACTICE_ABORT_SCOPE_REAL_TYPED_BINDING_DELTA_DESIGN.md)。§10のRT-B01に加え、§11でconstructor固定fake依存の認証→5列parent→release→preparedを同lease／停止で検証。parentは局所判定のみで、本書の安定性証拠を発行しない。CDの合成owner／台帳を実sessionへ登録せず、実class更新点移行・cleanup実接続と正式発行は未実施。
