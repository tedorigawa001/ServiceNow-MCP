# AU-BR-006 実session claim・private受領物・終了時失効の接続詳細設計

Version: br006-real-session-receipts-draft-0.2 / Date: 2026-10-27。
Status: **正式receiptの設計案。撤去後の実lifecycleはlive／ready／snapshot／理由の管理だけで、prepared owner／draft／claimはfixture専用台帳へ分離済み。実sessionの専用issuer／claim・正式発行は未実装／閉鎖**。
親：[固定source issuer](BEST_PRACTICE_ABORT_SCOPE_FIXED_SOURCE_ISSUER_DESIGN.md)、[接続契約](BEST_PRACTICE_ABORT_SCOPE_CONNECTION_CONTRACT_DESIGN.md)、[bounded予算](BEST_PRACTICE_ABORT_SCOPE_BOUNDED_BUDGET_DESIGN.md)。

後続の[実transport受領物・cleanup・単一C/G/E/R/clock設計](BEST_PRACTICE_ABORT_SCOPE_TRANSPORT_RECEIPTS_DESIGN.md)のfixture分離境界と、[共通停止／予算owner・実session／ReleasePermit binding設計draft-0.3](BEST_PRACTICE_ABORT_SCOPE_RUN_OWNER_BINDING_DESIGN.md)を優先する。fixtureから実session会計へ接続する旧経路は撤去し、fixture登録・owner・claim・会計は開発専用の別台帳へ移した。注入Responseの実Web Streams操作はそのfixtureにだけ接続する。実sessionのprivate run lifecycle／readonly予算leaseだけをfake I/Oで検証したが、正式source issuer／claim・証拠発行・有効化は未実装／閉鎖とする。

## 1. 範囲と現行との差

実BoundedReadSession側の一度限りのclaim、同sourceで選択されたmetadataと実取得payloadのprivate受領物、認証snapshot／ReleasePermitへの結合、停止／終了時の失効を定義する。正式receiptは内部契約案で、公開API／schemaへ追加済みではない。撤去後の現行境界は§11、撤去前の実装履歴の対応は§12を参照する。

§1〜§10は詳細設計案であって実装済みの宣言ではない。§11／§12で現行と履歴を区別する。取得許可先の追加・実source／worker接続・実機操作・トークン発行・設定変更・本番cap投入・公開規則登録・Pushは行わない。VM／監視／telemetryは保留、Unknown・全体受付無効を維持する。公開0.2/0.3、明示14／既定3規則、固定評価セットを変更しない。

設計時点の差分は下表のとおり。現在のruntime lifecycleに正式ownerがあるとは解釈せず、§11と新しい共通owner設計を併読する。

| 設計時点のコード | 確認した性質 | 必要な接続 |
|---|---|---|
| client.createBoundedReadSession | 設定／oauthをコピーしてsessionを生成 | receipt所有者とのprivate identity結合 |
| BoundedReadSession | origin・認証snapshot・readyPromise・単調時計・C/G/payload会計を所有 | BR-006生成claimと同期的な失効連携 |
| session.get／attempt | JSON値を返し、finallyでcancelを要求。最終向け固定4試行予約 | cleanup確認済みbody証拠、動的予約、用途別下位枠 |
| source.resolveRelease | source固有#permitをmatchedだけで発行、#decisionを再利用 | 新ownerへのprivateな発行時release snapshot結合 |
| source.listMetadata | private metadataへ全取得行をコピーし先頭max_recordsを返す | 選択window／行のopaque receipt |
| source.readPayload | 選択行・二重取得・ID／所属／版を照合しpayloadを課金 | 同受領bodyに結合したPayloadReadReceiptとone-shot移譲 |
| source.verify | finalStartedを一度だけ立て親→同条件metadataを再読 | 新final ownerとの排他・table再読／seal統合 |

plain record、getのJSON値、stats.requests、正常return、cancelを呼んだ事実だけでは新receiptを発行できない。合成source-stream／sealも本番権限へ昇格させない。

## 2. 発行元・内部型・所有権

handleは凍結opaque objectとし、ECMAScript private領域または非公開module台帳の参照一致で認識する。TypeScript brand／private修飾だけ、JSONの形、同値ID／hash／時刻では受理しない。raw値登録factory、合成handleとの互換cast、session／認証identityを取り出すgetterは作らない。

| 提案型 | 唯一の発行元 | 結合と寿命 |
|---|---|---|
| AuthSnapshotIdentity | 実session初期化部 | 固定origin／auth mode／snapshotへの参照。秘密をreceiptへ複製しない。stop/closeで失効 |
| AuthReadyGeneration | 同sessionの認証成功部 | 同readyPromise・AuthSnapshotIdentityの認証成功世代。再認証で交換しない |
| ClaimedSourceOwner | sourceのprivate生成入口＋session claim | session/source/認証世代/開始時刻/期限/budget owner/source世代。失敗後もclaimを戻さない |
| SelectionWindowReceipt | 新モードmetadata取得完了部 | 親snapshot、選択policy、全取得行とlookahead、truncated、発行時release証拠。finalまでsourceが保持 |
| SelectedAssetReceipt | 上記選択完了部 | 同window内の行・ordinal、sys_id/update_set/name/type/action/版。payload開始claimは別に一度だけ |
| PayloadReadReceipt | 新モードpayload取得完了部 | 同selected receipt／transport body、照合済み列、実payload文字列、受領時刻。worker移譲は一度だけ |

親設計のSourceRunEvidenceは正式発行済み証拠で、identityを確保しただけのClaimedSourceOwnerとは区別する。typed transport／cleanup条件が未成立ならactiveな証拠取得ownerへ進まない。

token／client secret／password／principalKey／認証identityの内部識別子をworker・MCP結果・例外・ログ・receiptの列挙可能propertyへ出さない。principalKeyは同時実行のcredential-keyであり、安定した本人sys_idや本人確認の証拠に使わない。同一processの悪意あるコードや侵害workerを隔離する保証ではない。

## 3. session claimと認証・ReleasePermit

### 3.1 生成順序

固定adapterが所有するsourceのprivate入口だけから開始する。任意session／URL／token／fetch／matched booleanを受けるconstructorは公開しない。

1. 入口のsourceから既知の実sessionを特定する。未知objectは拒否し、他sessionのclaimを探索・消費しない。
2. sessionがactive・未生成、legacy final未開始であることを確認する。session claimを同期的にunclaimed→claimingへ進め、同sourceのclaimも取得する。await前、残りの前提検査より前に行う。
3. session/source参照、AuthSnapshotIdentity、認証成功世代、親取得済み、同source発行のmatched #permitと発行時release snapshotを検査する。ここからの失敗でもclaimは消費済みのままにする。
4. 同sessionの停止通知にprivate ownerを結合し、停止との競合を再検査する。登録と最後のactive検査の間にawaitを置かない。
5. 選択前はprepared ownerとしてidentityを保持するだけ。新モードmetadata取得とtyped transport証拠が成立した時だけactiveなSourceRunEvidenceへ進む。外部ready引数では遷移しない。

claimはsession lifetimeで単一、source lifetimeでも単一。別source・別permit・catch後の再呼出しでリセットしない。二重生成は既存ownerを置き換えず、新発行を拒否する。生成失敗後の再要求では固定済みの理由を保持し、実停止が先行していればその理由を優先する。

prepared ownerは親設計§2の正式issuer発行に先立つ内部準備状態であり、選択metadata成立前の証拠発行を許す変更ではない。sourceの取得modeは選択開始前にlegacyまたはevidenceへ固定する。evidence modeで通常のlistMetadata/readPayload/verifyへ迂回して、二重取得・先行final・claimの省略を行う口を作らない。receipt対応の固定callerと統合final入口だけに接続し、legacy modeでは従来の戻り値・選択・verifyを変更しない。mode切替／有効化を公開ツール引数として追加する工程ではない。

### 3.2 認証snapshot

constructorで固定した実snapshotにAuthSnapshotIdentityを対応させ、最初の正常な認証完了をAuthReadyGenerationへpinする。per-userはそのsnapshotのtokenだけを使い、service-accountへフォールバックしない。service-accountのキャッシュtoken／既存OAuth交換も同sessionのC/G/期限内で処理する。

config再読、別clientからのtoken供給、token更新後の同owner継続、新sessionでの予算作り直しは禁止。ready失敗／認証継続不能なら停止し、再認証でclaimを救済しない。同値token／origin／instance bindingでも別sessionのidentityは一致しない。

### 3.3 release証拠

source内部#permitそのものの参照と、source内に固定したReleaseDecisionの深いsnapshotを使う。callerへ返したdecisionのnested objectを書き換えても根拠を変えられないようにする。生成・各receipt発行・worker移譲・final開始／completion消費の境界でpermitとactiveを再検査する。

unknown/mismatched、別sourceのpermit、cloneは拒否する。C方式operator_config由来matchedは許可し得るが、asserted／未実測／設定陳腐化のlimitationsを保持する。permitを実測Australia・table ACL・scope適合の証明へ強めない。設定期限を延長せず、既存の開始時固定・run全期限を覆うrelease証拠契約を維持する。

## 4. 選択metadata受領物

### 4.1 同じ取得から発行

新モードの1論理取得内で、固定GET→bounded body受領→schema／所属／filter／順序検査→source snapshot固定→receipt発行を行う。legacy listMetadata返却recordの後付け登録や、receiptのための再GETはしない。

SelectionWindowReceiptに次を固定する。

- 同session／認証世代／source／ReleasePermit／release snapshot／親snapshot。
- Update Set、selection_modeの実効値と省略有無、max_records、検証済みrequested rules／対象資産種別、candidate filter version。
- 内部生成query／order／limit／offset等、初回と最終で共有する選択policy identity。caller指定queryは受けない。
- 取得したmax_records+1以下の行、metadata_seen、truncated、選択領域とlookaheadのordinal。

親のsys_id/state/application/sys_updated_on/sys_mod_countと、metadataのsys_id/update_set/name/type/action/sys_updated_on/sys_mod_countを維持する。所属・重複なし・昇順・review_targetsのcandidatePolicy.acceptsを従来どおり検査する。合成版の固定100件／省略列へ置き換えない。

### 4.2 選択範囲とone-shot

SelectedAssetReceiptは受理済みwindowの先頭max_records以内だけに発行する。lookahead、未選択sys_id、別window、plain recordには発行しない。truncatedは範囲制限として保持し、選択領域をUpdate Set全体の網羅性へ拡大しない。

全選択行を最終metadata照合の基準として保持する一方、BR-006 jobは既存classificationと厳密な対象名／action判定を通ったBRに限定する。削除・非対象資産・Client Script・未対応actionからBR-006 payload/jobを生成しない。name由来の期待asset IDはworkerでXML実体との照合が必要であり、sourceがscript／sys_scopeの内容を認定したとは扱わない。

選択receiptのreadonly参照検査は繰返し可能。payload開始・worker移譲・比較はそれぞれ別のone-shotであり、receiptの再検査を再GET・再送の許可にしない。

## 5. payload受領物・移譲

### 5.1 取得と発行

1. active owner、同session/source/permit/window、選択ordinal、通常phase、未開始を検査する。
2. 選択行のpayload開始claimをawait前に消費する。既存attempted集合と同じ論理取得の状態を共有し、失敗後も戻さない。
3. 既存の固定sys_id＋update_set条件／必要列で1論理GETを行う。retryは同用途・予算で最大2試行とし、新claimを作らない。
4. 受信byteはtransportだけが課金する。payloadが文字列なら、現行同様、後続schema不適合でもpayload課金する。失敗分を返金せず、再発行／hash／IPCのために二重payload課金しない。
5. sys_id/update_set/name/action/sys_updated_on/sys_mod_countを選択行と完全照合する。typeはmetadata側に保持するが、現行payload要求列にないためpayloadから独立再確認済みとは言わない。
6. 同transport bodyのowner／用途／phase／取得claim／cleanup confirmedを照合し、停止・phase失効を再検査してからPayloadReadReceiptを一度だけ発行する。

受信した同じpayload文字列を保持する。sourceでXMLの再解析・書換え・再取得・空白／実体参照の正規化をしない。payloadと安全抽出scriptのhashは後続の固定workerで計算して最初の正しいprepare応答へpinする。caller申告hashから証拠を作らない。

### 5.2 worker移譲口

将来の固定callerだけが、同selected/windowに結合したPayloadReadReceiptから本文を同runの新規jobへ一度だけ渡す。移譲claimはpostMessage前に消費し、送信失敗／worker終了後も別job・別workerへ自動再送しない。

実job/port/世代の発行元は別工程。nonce／hash／job IDだけで認定せず、実worker ownerのprivate handleと結合するまで移譲口を有効化しない。本文をMCP結果・診断・receipt view・ログへ出すgeneric getterを作らない。

親の本文参照は既存解析器との共有を含め寿命を明示し、prepare応答／中断後に不要なら解放する。最終照合に使うのは版・選択・受領物identityで、本文の再GETではない。親の参照削除だけでworker内の参照破棄／終了確認済みとはしない。

## 6. typed transportへの依存・昇格禁止

現行attemptはfinallyでcancelを要求するが、完了をawaitした型付きcleanup証拠を返さない。**JSON returnだけでは正式receiptの発行条件を満たさない**。

後工程の実transport内だけが発行できるBoundedBodyReceiptを前提に、同session／認証世代／budget owner、固定source／用途permit／論理取得claim、normal/finalとphase世代、同受信body、C/G/S/Eとpayload会計、内部受領時刻、cleanup dispositionを結合する。pending／late／unconfirmedなら正常receiptを発行しない。

任意get結果やaccepted booleanの登録factoryではなく、実受信・中断・cleanupと同じ制御フローで発行し、sourceは検査後一度だけ消費する。専用capabilityが未接続／未承認ならownerはpreparedまでに留め、証拠発行を開始しない。

動的予約・下位byte枠・cleanup確認と残時間配賦は別工程。本書でsys_db_objectを汎用getへ追加したり、final booleanで予約を迂回したりしない。実sourceの同取得から親／release／選択を結び、合成版prepareによる追加取得は導入しない。

## 7. 状態・phase・終了時失効

| 所有者 | 正常遷移 | 不可逆性 |
|---|---|---|
| session claim | unclaimed→claiming→claimed | 失敗理由と消費済みをsession lifetimeで保持、元へ戻さない |
| source owner | prepared→active(normal)→finalizing→sealed | 失敗／hard stop／closeでrevoked。再生成・再開しない |
| payload取得 | unstarted→started→received または unavailable/rejected | 例外後も開始済み。同じ論理取得内のretry以外は禁止 |
| 本文移譲 | pending→consumed | 送信失敗でもpendingへ戻さず、別job再利用禁止 |

preparedはidentity確保だけ。activeには選択とtyped受領境界の成立が必要。sealedも実FinalSourceSeal／上位completionの後工程接続なしには公開完了にならない。

### 7.1 phase cutoff

通常phase cutoffでは新payload／prepareを止め、進行中取得を取消し、その発行permitを失効させる。発行済み選択／payloadのreadonly identityは同runのfinal照合へ保持できるが、新GET／新jobへ再利用しない。final予約への遷移が必要なため、phase cutoffだけでsession全体を閉じない。

phase世代を内部固定し、setPhaseReserveで新controllerを作っても旧世代のlate bodyから新receiptを発行しない。新phaseで全体開始時刻を更新しない。normal50秒／整合55秒／全体60秒と既存低減時の比例reserveを延長しない。55秒までに不足したfinal／比較は未確認、残りは既存集約／終了処理に限る。

### 7.2 hard stop・close

hard stopでは最初のsession stopCode固定→private ownerを同期的にrevokedへ→発行permit／pending claim失効→controller abortの順にする。現行stopには基本lifecycleのrevoke通知があるが、正式owner／claim／receipt失効まで接続済みとは扱わず、後工程で追加する。revokeはthrowせず、user callbackを呼ばず、再入しても一度だけ行う。

closeでも先に失効し、late HTTP／認証／worker応答が発行へ進めないようにする。すべてのawait後、receipt発行／移譲／completion直前でactive・owner・permit・phaseを再検査する。先行primaryをcloseで上書きしない。

本文・選択cache・不要なrelease参照を破棄し、固定診断だけを上位ownerへ渡す。読取／workerのcancel要求と終了確認は同じ残時間へ合流し、予約解放やMap消去だけでcleanup=confirmedにしない。未確認はそのまま保持する。

timer／external listener／同時実行枠はsession.closeが一度だけ解放する。owner側でactive/principalsを重複操作しない。cache削除でclaimを初期化しない。

現行closeはsession tokenとsnapshotのperUserBearerToken/accessToken参照を外すが、snapshot.oauthの全資格情報破棄まで証明していない。新ownerは秘密をコピーせず、将来のtransport終了処理で一時参照の寿命を検証する。共有client設定・永続資格情報・元tokenを勝手に削除しない。JS文字列の物理ゼロ化やOS buffer消失は保証しない。

## 8. 固定失敗理由・上位保持

新語彙は内部提案であり現行ReadFailureCode／公開errorsへ追加済みではない。公開対応は親接続契約§7〜§8の別工程。生例外や任意文字列を返さない。

| 条件 | 内部分類・処理 |
|---|---|
| unknown/mismatched／別permit | release_not_admitted。発行前に停止し、修正permitで同claimを救済しない |
| 別session/source/認証世代/window、receipt clone | evidence_binding_mismatch。owner停止、証拠再登録禁止 |
| 二重生成／payload開始／移譲、final後の開始 | invalid_state。新発行を拒否し先行診断とclaim消費を保持 |
| candidate filter違反 | candidate_filter_violationで既存どおりrun停止。lookahead／未選択receipt利用はbinding違反 |
| payloadの所属・版不一致 | changed_during_review。receiptなしでそのassetの既存retrieval_failedとBR-006未評価を保持し、新版への再GET禁止 |
| payload404／不正応答／上流枯渇／単体payload上限 | 固定の既存asset理由。開始claimは消費済み、receiptなし。他asset継続は従来契約に従う |
| 通常試行枠不足／phase cutoff | 新取得を止め理由付き未処理／未評価。同final予約への遷移だけ許す |
| 401/403／取消／hard deadline／G・総payload超過 | sessionの全体停止を維持し全発行を失効。scope不足へ格下げしない |
| typed transport未接続／cleanup未確認 | 有効化前に拒否。実行中の確認不能は固定internal_review_error等で停止し、cleanup不明を保持。成功receiptなし |

生成重複は新要求を拒否して既存ownerを維持するが、進行中owner内の二重payload／移譲やbinding違反はそのownerを停止する。release不一致でownerを発行しない場合も、既存の全規則release gateの未評価契約を変更しない。phase・asset局所理由とrun停止の区分は親接続契約に従い、公開結果への対応をこの内部案だけで確定しない。

生成前の失敗も捨てないよう固定callerは先に上位diagnostic slotを確保する。生成失敗／owner停止／局所asset理由を区別し、最初のprimaryを保持する。R-2のInputRejected／Outerを流用したとは扱わず、BR-006実adapterに必要な保持契約として後工程で接続する。

## 9. 費目・上限・将来検証

| 費目 | 所有者と上限 |
|---|---|
| identity／claim／release結合検査 | session/sourceの固定制御費。HTTP／byteに再課金しない |
| 選択receipt収集 | 同metadata検査に結合。max_records<=100、lookahead含め<=101、行receipt<=100 |
| payload取得・保持 | 同GETでC/G、現行chargePayloadの1回で単体2MiB／累計8MiB。handle発行で再加算しない |
| 台帳・基準値・本文寿命 | O(max_records)、本文は必要なpending jobまで。IPC／保持cap具体化・承認前に有効化しない |
| 失効・解放 | 選択／pending件数に比例するbounded処理。同じ残時間を使い、別deadlineを作らない |

全体210試行／受信16MiB／通常1応答4MiB／単体timeout10秒以下かつ残phase内を維持する。新しい下位枠・予約・control work／IPC保持上界は別工程で独立計数し、全体受付を有効化しない。

必須の将来合成試験：

- 実session class＋fake transportで同session別source二重生成、await前claim、生成途中の停止、失敗後再生成拒否。
- 同値token／originでも別session拒否、per-user権限切替不可、ready失敗後再認証不可。
- permit clone／他source／unknown／mismatched、返却decisionのnested書換え、C方式limitations保持。
- selection_mode省略互換／全mode、max_records=1/100、lookahead、filter違反、重複／逆順／別Update Set、返却record改変からの独立性。
- 失敗分も含む課金、版変更、payload_limit、二重取得／移譲、raw record／hash／合成receiptからの正式発行拒否。
- cleanup pending/unconfirmed／late body／phase世代更新／stop-close競合で発行ゼロ、同期revoke、解放と同時実行枠の二重返却拒否。
- source終了後worker応答拒否、上位primary保持、本文／資格情報／内部identity非出力、legacy0.2/0.3の選択・verify互換。

## 10. 推奨実装順・承認待ち

1. owner内部型・session生成claim・AuthSnapshotIdentity結合・同期revoke契約をfake依存で試験する。証拠発行口は閉じたままにする。
2. 選択window／行receiptとpayload開始・移譲claimの内部型を追加。scalar factoryを公開せず、未接続transportでは正式発行できないことを試験する。
3. 実transportの用途別body receipt／cleanup証拠／単一C/G/E/R/clockを別工程で完成し、同metadata／payload取得内の正式発行へ接続する。
4. 実worker plan／job配送、実選択を保持した最終verify／seal、上位結果へ接続。legacy verify後に親／一覧を再取得する方式は採らない。

未確定：private module配置、cleanup確認方式と残時間配賦、保持／IPC/control work上界、下位cap、実worker配送、次版公開診断、PDIのACL／field応答。本書だけで本番cap・実接続・実行permit・公開登録を承認しない。

設計初回は現行ソースとの照合と文書確認だけを行った。後続の実装・合成検証は次節を参照する。

## 11. 撤去後の現行実装境界（2026-10-27）

旧§11／§12が述べていたruntimeへのfixture owner／claim接続は撤去済みである。以下を現在の実装として扱い、撤去前の説明を生成手順に流用しない。

| 現在の配置 | 実装されている範囲 | 実装されていない範囲 |
|---|---|---|
| `src/servicenow/review-evidence-lifecycle.ts` | live／ready boolean／snapshot参照／理由をprivate WeakMapで保持し、stop／closeで失効 | AuthSnapshotIdentity／AuthReadyGenerationという正式な参照型、prepared owner／生成claim／selection draft／transport activationの発行API |
| `src/servicenow/bounded-read.ts` | 孤立snapshotの登録、同readyPromise成功の通知、stop／closeの同期revoke、既存認証・C/G/P・時計・終了処理 | 証拠用E/R・typed body／cleanup・BR-006 source owner／workerへの正式binding |
| `src/review/bounded-source.ts` | 同sourceのReleasePermit参照、matched gate、選択行・payload版の照合と課金、verify | 正式なSelectionWindowReceipt／PayloadReadReceipt・不変release snapshotを新ownerへ結ぶ入口 |
| `src/review/abort-scope-evidence-fixture-lifecycle.ts` | fixture専用登録・AuthSnapshotIdentity／ready参照・prepared owner／claim／window／payload draft | 本番session台帳との共有・本番receipt発行。実BoundedReadSessionのfixture登録は拒否 |
| fixture会計・固定source・worker群 | 分離された同fixture予算でOAuth→source初回／最終→native IPC→fixture上位結果まで合成検証 | 本番token／ReleasePermit／選択payload／worker jobの正式な由来・公開finding |

実lifecycle moduleがnpmへ同梱されるのはbounded-readの既存import先だからであり、正式owner発行口の同梱を意味しない。fixture群は`!dist/review/abort-scope-evidence*`で非同梱のまま。登録hookが存在するというだけで、任意objectを本番ownerとして認識する新factoryを設けない。

共通停止／予算ownerと実source claimは[新しい詳細設計](BEST_PRACTICE_ABORT_SCOPE_RUN_OWNER_BINDING_DESIGN.md)に従い、fixture経路を復活させるのではなく、発行元を限定した本番専用の内部経路として後工程で検討する。preparedはidentity確保に留め、正式発行口は閉鎖する。

## 12. 撤去前の履歴とfixture側への対応

本節は過去の変更の所在を保つための整理であり、現行runtimeの実装説明ではない。過去の検証記録は当時の実行結果として残し、安全な本番bindingの証拠へ読み替えない。

| 撤去前の記述 | 現在の扱い |
|---|---|
| runtime coreの`registerPreparedFixtureSource`／prepared owner生成・session claim | 実lifecycleから撤去。fixture専用lifecycle／issuerへ分離。本番発行元には使わない |
| runtimeのAuthSnapshotIdentity／AuthReadyGenerationとowner参照照合 | そのowner機構はfixture専用。実lifecycleは現在ready boolean等に留まり、正式な参照世代結合は設計課題 |
| PreparedSelectionWindow／PreparedSelectedRow／payload開始・fake完了・移譲claim | fixture台帳内のdraftとして維持。fake readyは本文・HTTP成功・cleanup・worker jobを証明しない |
| fake sourceのparent-ready／matched／permitを使う生成手順 | fixture検証だけ。本番は同source内部のReleasePermitと発行時release根拠を使い、scalar factoryを作らない |
| 固定100行／BR-006単独のfixture選択・最大401 handleの構造 | 当該fixture subsetの性質。本番の混在ruleset・selection_mode・実取得・保持上界の確認済み値ではない |
| fixture会計portを実sessionへ接続する旧transport factory | 撤去済み。実sessionの通常get経路との二重会計／mode切替口として再導入しない |

過去の記録：[session owner合成検証](E2E_BEST_PRACTICE_ABORT_SCOPE_SESSION_OWNER_SYNTHETIC_2026-10-26.md)、[selection／claim合成検証](E2E_BEST_PRACTICE_ABORT_SCOPE_SELECTION_CLAIMS_SYNTHETIC_2026-10-26.md)。

後続のfixture分離境界は[transport設計](BEST_PRACTICE_ABORT_SCOPE_TRANSPORT_RECEIPTS_DESIGN.md)、OAuth起点の連続検証は[移譲設計§14](BEST_PRACTICE_ABORT_SCOPE_OAUTH_SOURCE_HANDOFF_DESIGN.md#14-oauth起点のworker上位結果までの連続合成e2e)を参照する。いずれも正式receipt・本番issuer・公開AU-BR-006の有効化を意味しない。

残課題は実sourceのprivate claim／不変release snapshot、typed body／cleanup、選択payload、正式worker job、final／上位結果、共通停止／予算と費目上界。Unknown・全体受付無効・正式発行口閉鎖・VM／監視／telemetry保留を維持する。
