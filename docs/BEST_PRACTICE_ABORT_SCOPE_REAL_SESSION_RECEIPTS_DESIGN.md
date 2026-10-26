# AU-BR-006 実session claim・private受領物・終了時失効の接続詳細設計

Version: br006-real-session-receipts-draft-0.1 / Date: 2026-10-26。
Status: **owner／session lifecycleに加え、選択window／行draftとpayload開始・移譲claimをfake依存で部分実装。正式receipt／実source／worker接続は未実装・未承認**。
親：[固定source issuer](BEST_PRACTICE_ABORT_SCOPE_FIXED_SOURCE_ISSUER_DESIGN.md)、[接続契約](BEST_PRACTICE_ABORT_SCOPE_CONNECTION_CONTRACT_DESIGN.md)、[bounded予算](BEST_PRACTICE_ABORT_SCOPE_BOUNDED_BUDGET_DESIGN.md)。

## 1. 範囲と現行との差

実BoundedReadSession側の一度限りのclaim、同sourceで選択されたmetadataと実取得payloadのprivate受領物、認証snapshot／ReleasePermitへの結合、停止／終了時の失効を定義する。正式receiptは内部契約案で、公開API／schemaへ追加済みではない。部分実装した内部型の範囲は§11を参照する。

§1〜§10は詳細設計、後続の部分実装範囲は§11に記す。取得許可先の追加・実source／worker接続・実機操作・トークン発行・設定変更・本番cap投入・公開規則登録・Pushは行わない。VM／監視／telemetryは保留、Unknown・全体受付無効を維持する。公開0.2/0.3、明示14／既定3規則、固定評価セットを変更しない。

設計時点の差分は下表のとおり。後続のsession lifecycle部分実装は§11に記す。

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

hard stopでは最初のsession stopCode固定→private ownerを同期的にrevokedへ→発行permit／pending claim失効→controller abortの順にする。現行stopにこの接続があるとは扱わず、後工程で追加する。revokeはthrowせず、user callbackを呼ばず、再入しても一度だけ行う。

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

## 11. prepared owner／session lifecycleの限定実装

`src/servicenow/review-evidence-lifecycle.ts`にprivate module台帳、AuthSnapshotIdentity、AuthReadyGeneration、prepared owner内部型とsession側claimを実装した。実BoundedReadSessionのconstructorは孤立snapshot参照を登録し、同readyPromiseの成功を一度だけpinする。stopは最初の理由を固定した後、controller.abortより先に同期revokeし、closeもphase／controllerのabortより先に失効させる。revokeは外部callbackを呼ばず、owner binding・coreのsnapshot／ready参照を外す。owner失効は一度だけで、close後の認証完了でも復活しない。

source発行元は`abort-scope-evidence-session-fixture.ts`のfake issuerだけ。runtime coreの`registerPreparedFixtureSource`は非権威の内部fixture portで、実BoundedUpdateSetSourceは呼ばない。fake source／permit／parent-ready／matchedは実取得・実ReleasePermitの証明ではない。core登録portを含め同process内の信頼コード向けの境界であり、悪意あるdeep importを隔離するものではない。

既知の同sessionに属するfake sourceだけがclaimを開始でき、claim取得後の前提不成立でも消費済みを戻さない。未知／他sessionのsourceは無関係なsession claimを消費せず拒否する。重複生成では既存ownerを置換しない。auth identityとready世代の参照、fake permit、parent-ready、final未開始を照合する。release証拠の深いsnapshot、実source取得mode／claim、選択window、payload receiptはまだ未接続。

返すownerはpreparedかrevokedだけで、active／receipt／sealへの昇格APIは存在しない。閉じた診断用gateは有効なprepared ownerにも必ずinvalid_stateを返し、`evidence_issuance:'disabled'`を維持する。型のbrand・handleのclone・他fake issuer・同値資格情報の新sessionでは受理しない。

既存ReadFailureCodeは網羅的な固定一覧で保持し、未知値だけをinternal_review_errorへ落とす。通常phase cutoffはauth-ready済みowner全体を失効させず、hard期限／取消／受信超過等では同期revokeする。最初の認証がphase cutoff等で完了できなかった場合はready世代を発行せず、認証失敗の理由を保持して新owner生成を拒否する。phase別receipt発行permitは未実装なので、これで旧phaseのbody受領証拠が完成したとは扱わない。

session getの認証完了通知とstop/closeだけを結び、HTTP許可先・origin・headers・retry・C/G/payload会計・時計／上限は変更していない。証拠専用transport、cleanup確認、real receipt、実worker／上位結果、公開規則登録は閉じたまま。session.closeの既存資格情報処理も変更せず、全秘密の物理破棄を保証しない。

runtime lifecycleはbounded-readのimport先なのでnpmへ同梱する。fake issuerと既存合成証拠moduleは従来の`!dist/review/abort-scope-evidence*`で除外する。新依存パッケージは追加しない。梱包テストにruntime lifecycleの存在確認を加えた。

検証は[session owner合成記録](E2E_BEST_PRACTICE_ABORT_SCOPE_SESSION_OWNER_SYNTHETIC_2026-10-26.md)。選択window／行receipt・payload開始／移譲claimの後続部分実装は次節に記す。

## 12. 選択window／行draftとpayload claimの限定実装

### 12.1 型と発行元

同じruntime coreにPreparedSelectionWindow／PreparedSelectedRow／PreparedPayloadStart／PreparedPayloadReady／PreparedTransferClaimを追加した。すべて凍結opaque handleで、非公開WeakMapに同owner／session・window・行・開始票の参照を結合する。fake issuerのowned検査を通し、coreでもownerの認証／permit結合と失効を再検査する。raw record・同じ値・cloneでは受理しない。

これはSelectionWindowReceipt／PayloadReadReceiptの本番発行実装ではない。登録口はfake issuerからfixtureを受けるだけで、実source／ReleasePermit／typed transport／cleanup／jobの真正性は未証明。ownerはpreparedのまま、正式な証拠発行gateは必ず拒否する。

### 12.2 windowと選択範囲

window開始claimをfixtureのclone／検査より前に消費する。fixtureを一度だけcloneし、その間のclose／再入を再検査する。不正入力で失敗しても修正fixtureによる再開始はできない。

parentはsys_id/state/application/版、metadataはsys_id/update_set/name/type/action/版をstrict検査し、所属・昇順・重複なしを要求する。max_recordsは1..100、取得行はmax_records+1以下・最大101、先頭max_recordsだけに行draftを発行する。lookaheadはmetadata_seen／truncatedに残すが行draftを発行しない。空windowから行を補完しない。

今回のfake recipeはrequested_rule_ids=['AU-BR-006']だけの限定subset。selection_mode省略はbounded_allとして省略状態を保持し、review_targetsはtarget-prefix-0.1を要求する。BR候補のaction/name prefixとclient/include除外を全取得行（lookaheadを含む）へ検査する。混在ruleset、実sourceのcandidatePolicy identity／選択windowとの結合は未接続であり、公開ルール選択や0.2/0.3を変更していない。

行のreadonly lookupは同handleを繰返し返すだけで再取得権限を増やさない。外部へ返すwindow summaryはmode／省略有無／件数／truncated／disabledだけ。本文・metadataの全列・認証参照を返すgetterは作らない。

### 12.3 開始・fake完了・移譲

1. beginPreparedPayloadは同owner/session/window/行を検査して開始claimを一度だけ取得する。INSERT_OR_UPDATEかつ厳密なsys_script_<32桁>だけを対象とし、Client Script／Script Include／削除／不正名を拒否する。
2. settlePreparedPayloadは開始票を一度だけreadyまたはunavailableへ終端化する。readyは**本文を持たないfake完了票**であり、HTTP成功・payload受信・版一致・cleanupを証明しない。unavailableからreadyへの修正や開始やり直しは拒否する。
3. claimPreparedTransferは同じ行に対応するfake完了票を一度だけ消費し、移譲claimを発行する。別行／別ownerの完了票は混ぜられない。
4. consumePreparedTransferは移譲claimを一度だけ消費し、state=simulated／synthetic=true／evidence_issuance=disabledだけを返す。本文出力・GET・postMessage・実job配送はない。実worker/port/jobへの結合は依然未実装。

重複・混入・不正順序は対象ownerを失効させ、先行理由を保持する。無関係な他ownerの票は消費しない。ownerの同期revokeはwindowのsnapshot／session参照と全行のdata／start参照を外す。保持済みhandleからの全操作は元の停止理由で拒否される。機能的な失効と参照除去を実装したのであり、GC完了や物理ゼロ化を認定しない。

### 12.4 有限構造と未対応

owner当たりwindowは1つ、選択行は最大100、各行に開始票／fake完了票／移譲claimは各最大1。selection/claim handleは最大401（既存owner handleを除く）。snapshotは最大101行で、収集／失効はO(max_records)。本文は保持せず、C/G/payload会計やHTTP／timer／IPCを追加しない。これは実transport受信上限・IPC保持・全体work受付の承認ではない。

今回のclaimはfake状態機械の検証に限定し、通常phaseへの実取得admissionやphase世代に結ぶ発行permitは未接続。ownerは通常cutoffだけでは失効しないため、prepared handleの存在を通常phaseのGET許可へ転用しない。hard deadline通知／取消／closeでのowner失効は継承する。

残課題は実sourceの選択receipt／deep release snapshot・typed body／cleanup・同payloadの版／課金・phase admission・実worker job移譲・final seal／上位結果。これらの接続前にfake完了票やdraftを正式receiptへ昇格しない。

検証：[selection／claim合成記録](E2E_BEST_PRACTICE_ABORT_SCOPE_SELECTION_CLAIMS_SYNTHETIC_2026-10-26.md)。VM／監視／telemetry保留、Unknown・全体受付無効・正式発行口閉鎖を維持する。
