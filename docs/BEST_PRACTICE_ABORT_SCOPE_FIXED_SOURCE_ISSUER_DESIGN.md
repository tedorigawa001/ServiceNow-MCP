# AU-BR-006 固定source issuer：実session・取得・再読・予算結合

Version: br006-fixed-source-issuer-draft-0.2 / Date: 2026-10-26。
Status: **合成issuerの内部型/生成claim/固定GET/正規化を実装。実session/transport/worker/上位結果への接続は未実施・未承認**。
親：[接続契約](BEST_PRACTICE_ABORT_SCOPE_CONNECTION_CONTRACT_DESIGN.md)、[bounded予算設計](BEST_PRACTICE_ABORT_SCOPE_BOUNDED_BUDGET_DESIGN.md)。

次段の[実session claim・private受領物・終了時失効の詳細設計draft-0.2](BEST_PRACTICE_ABORT_SCOPE_REAL_SESSION_RECEIPTS_DESIGN.md)で、認証snapshot／ReleasePermit／実選択条件への結合を具体化し、撤去後のruntimeとfixtureを区別した。さらに[共通停止／予算owner・正式binding設計draft-0.2](BEST_PRACTICE_ABORT_SCOPE_RUN_OWNER_BINDING_DESIGN.md)で、認証前のrun確保とmatched後のsource claim、不変release snapshot、生成失敗からの診断保持を定める。typed transportとcleanup証拠が未接続ならpreparedに留めて正式receiptを発行しない。正式証拠経路の実装・有効化は未実施。

後続では同詳細設計§11のprepared owner／実session lifecycleだけをfake source依存で部分実装した。実sourceの#permit／選択receipt／table取得への接続や正式発行口の有効化は未実施のまま。

実body受領の後段条件は[実transport受領物・cleanup証拠・単一予算の詳細設計draft-0.1](BEST_PRACTICE_ABORT_SCOPE_TRANSPORT_RECEIPTS_DESIGN.md)へ具体化した。sourceは同用途／phaseのprivate bodyを一度だけ消費し、C/G/Eを再加算しない。cleanup未確認では正常受領物／sealを発行しない。実source／worker接続・本番capの承認は引き続き未実施。

## 1. 現状と本設計の範囲

現行BoundedUpdateSetSourceは実sessionをprivateに保持し、matchedの場合だけsource固有のReleasePermitを発行する。listMetadata/readPayload/verifyは同permitの参照一致とsession.assertActiveを要求する。verifyはfinalStartedを一度だけ立て、親→metadataの再読を行う。

一方、BR-006のowner/channel/予約台帳/streamは合成部品であり、任意fixture・scalarから生成できる。実取得の証明にはならない。streamのacceptedはJSON構文/byte枠の受理だけで、body値・source/ACL・必要列・版・再読の証明を返していない。

本案は、**固定sourceだけが発行できるprivateな受領物と、同じ実sessionの予算を使ったtable取得**を定義する。実装時も合成factoryを本番発行関数として公開しない。実Worker/AST/公開JSONの接続は別工程。既存0.2/0.3・明示14/既定3規則を変更せず、現行非BR-006経路は互換経路として残す。

## 2. ownerと発行権限

提案する`FixedScopeSourceIssuer`はBoundedUpdateSetSourceのprivate生成経路からだけ作る。URL/token/任意client/任意fetch callback/「matched=true」を受けるconstructorを公開しない。固定adapterのrun ownerがsourceに生成を要求し、次を同期的に検査する。

1. 固定内部呼出しのsourceに結ばれた実sessionを特定し、active/未生成claimを確認する。callerの自己申告session参照で代用しない。
2. 同sessionのissuer生成claimとsource側claimを**残りの生成検査より前に消費**する。同sessionに別sourceを作っても再発行できず、この後の失敗/終了でclaimを戻さない。session GCまで二重生成拒否を保つ。
3. 同sourceの親・リリース判定・選択metadataが成立し、finalStarted/failed/closedでないこと、permitがsource内部の`#permit`そのものであることを検査する。clone/JSON/別sourceの同形permitは拒否。
4. 実session参照・認証snapshotのprivate identity・source参照・source開始時刻・instance binding・Update Setを固定する。tokenやprincipal hashはworker/結果へ出さない。
5. 同session所有のC/G/Eと最終予約台帳を借用する。別の合成台帳・別のタイマー・異なる認証を作らない。

既存の#requirePermitだけで「実session内にissuerが1個」を保証したとは扱わない。session claim、source claim、予算ownerへの結合は追加実装が必要。callerがsource/sessionのprivate参照を取り出すgetterも作らない。

ReleasePermitはリリースgateへの入場証であり、table ACLの読取権限やscopeの正しさを与えない。C方式のoperator_config由来matchedでも利用可能な設計だが、asserted/未実測/設定陳腐化の制限を保持する。callerへ返したReleaseDecision objectの書換えを真正性の根拠にせず、発行時のprivate snapshotに結ぶ。既存permitの意味を「実測Australiaの保証」へ強めない。

## 3. private受領物と供給経路

全handleはrealm内の非公開台帳で認識する凍結opaque値。TypeScript brandや一致hashだけでは受理しない。raw JSONを登録して同等handleを作る汎用factoryは設けない。

| 提案型 | 発行者/前提 | 保持する結合・寿命 |
|---|---|---|
| SourceRunEvidence | sourceのprivate issuer生成部 | 実session/source/permit/認証snapshot/リリースsnapshot/開始時刻/予算owner。run終了で失効 |
| SelectedAssetReceipt | 同sourceの選択metadata処理 | Update Set/Update XML/name/action/版、選択window内の行。最大100件。任意sys_idでは生成不可 |
| PayloadReadReceipt | 同sourceの固定payload取得 | 選択行、照合済みID/所属/版、実受領payload、受領時刻、transport受領物。readPayloadで成立した物だけ |
| ScopePlanBinding | 固定run ownerの検証済みworker応答受理部 | 上記receiptと実worker/port/世代/要求/job、payload/code hash、collection、site。別payloadへ付替え不可 |
| TableReadReceipt | 固定issuerの初回/最終読取 | 同run/table受付handle/phase/transport試行受領物/時刻/正規化観測。最大8名×2phase |
| FinalSourceSeal | 同sourceの最終調整部 | 親/metadata再照合の状態、受付tableの全final終端、残予約解放、source世代/cleanup状態。成功値と未確認を区別 |

現在のreadPayloadが返すplain recordを、そのまま新しいprivate receiptと見なさない。新モードの固定取得経路内で、既存の受信・payload課金・metadata照合が成立した時だけreceiptを発行する。legacyの戻り値や、callerがコピー/修正したrecordを後付け登録する口を作らない。

workerへ送る本文はPayloadReadReceiptに対応する実受領文字列だけ。親は私有台帳でreceipt→要求→実Worker/portを結ぶ。hashは固定workerが既存のUTF-8 SHA-256方式で、受信payload全文と安全抽出したscriptから計算する。親は任意hashを申告させず、最初の正しいprepare応答で同jobへ一度だけpinする。

これは信頼するworkerの解析と送信元相関による結合であり、sourceがhashを独立再計算したという主張ではない。hash一致だけで実取得を証明しない。parentに別XML/AST解析器を作らず、同本文の再取得/二重payload課金もしない。

現時点でScopePlanBindingの実worker発行元は未接続。最初の実装は合成issuerで上記の前提・消費を試験するだけとし、合成plan/receiptを本番発行に昇格させない。実接続時は合成factory/import経路を到達不能に分離する。

## 4. 固定GETと受領物の発行

### 4.1 要求

| 項目 | 固定仕様 |
|---|---|
| 接続先/認証 | 実sessionの固定origin/認証snapshot。設定を再読せずredirectも許可しない |
| method/path | GET `/api/now/table/sys_db_object` |
| query | `name=<検証済みcollection>^ORDERBYsys_id`を内部生成。URLSearchParamsで符号化 |
| fields | `sys_id,name,sys_scope,sys_updated_on,sys_mod_count`だけ |
| その他 | limit=2、offset=0、no_count=true、display_value=false、exclude_reference_link=true |
| 用途 | 対象tableの初回または最終だけ。各1論理GET・最大2 HTTP試行 |

collectionは固定worker計画由来かつ`^[a-z][a-z0-9_]{0,79}$`、globalは対象table未特定で取得しない。外部入力のtable/query/URL/fieldsを通さない。sys_scope/sys_app/current BR/sys_dictionary/親table探索への代替取得も行わない。

### 4.2 transport→sourceの受領境界

将来の専用bounded transportは、cap内で受け取ったJSON値と試行/用途/byte会計をprivateなBoundedBodyReceiptへ結ぶ。sourceは同session/用途/phaseとcleanup状態を検査してから値を取り出す。合成streamのaccepted/byte数や一般clientのレスポンスだけでは代用しない。

HTTPのraw値は`result`配列0..2件を要求する。sourceが必要5列だけを新objectへ射影し、余分な列/外側キーは保持・wire転送・ログ出力しない。16KiB枠を読み終えた後で付けるだけの実装は禁止。byte会計が成立しても、schema/identityの検査前に証拠を発行しない。

| 応答 | 正規化/発行条件 |
|---|---|
| 正常1件 | sys_id32桁、name完全一致、版文字列/カウンタ形式を確認。scopeはglobal/32桁/nullに正規化 |
| scopeだけ欠落/null | rows.sys_scope=nullのUnknown。Globalと推定しない |
| scopeが表示名/参照object/不正文字列 | unavailable/invalid_observation。元の値は保持しない |
| 他の必要列が欠落 | unavailable/field_unavailable。欠損IDや版を生成しない |
| 正常0件/404 | unavailable/not_found_or_not_visible。不存在とACL不可視を断定しない |
| 正常2件 | validなname/形を検査後、unavailable/ambiguous_table。先頭1件を採用しない |
| nameが要求と違う | table_binding_mismatchでowner停止。別tableの事実へ流用しない |
| resultが配列でない/3件以上/不正JSON/その他形不正 | unavailable/invalid_observation。APIを変えて取り直さない |

observed_atは同sessionの内部時計で受領/検査完了時に固定する。sys_updated_onはサーバー版文字列として比較し、観測時刻の代わりにしない。時刻逆行/全体区間外・binding矛盾は停止する。実scopeの存在/実table/実行経路/中止成否までは認定しない。

## 5. 初回観測・共有cache・one-shot

issuer状態はactive→finalizing→sealed→closed、または任意の未終端状態→failed→closed。一度failed/closedになったら再開しない。各tableは未受付→initial_pending→initial_received→final_pending→final_received/未実施で終端。pending開始claimはawaitの前に消費し、例外/不足でも戻さない。

新nameの受付と初回開始は予算台帳のbusy境界内で行い、T/R/初回占有を一体更新する。初回は通常phaseまで。正常/不足とも1つの原観測をrun内だけでcacheする。同名の後続jobはその原観測へ結び直し、HTTPやT/Rを増やさない。失敗を新しい初回としてやり直さない。

原観測は複数jobで使えるが、job別delivery claimは一度だけ。`job/phase→TableReadReceipt`の結合を親ownerに保持し、1つのpayload context/worker handleを他jobへ転用しない。別session/認証/run/worker世代へのcache共有は禁止。shared初回が後続payloadより前でも、最終は両方より後であることが必要。

未知scopeや曖昧/不可視を後続assetからのlookupで補完しない。初回不足によりfinal不要とする場合も、整合phaseでunavailable/not_collectedを発行する。observed_atは未実施判断の内部時刻で、実再読の時刻ではない。

## 6. 最終再読と既存verifyの統合

新モードのprivateな`finalizeScopeSource`（提案名）が、sourceのfinalStartedとissuerのfinalizingを一度だけ取得する。独立issuerがlegacy verifyを呼んだ後に親/一覧を再取得する方式は採らない。

1. 通常phaseを閉じ、未開始/再試行待ちの通常readは既存台帳のenterFinalで未実施終端化する。実inflightがあれば中断/終了処理と合流してから進み、並行finalは開始しない。
2. 同source/permitの親slotで既存親を再読し、metadata slotで同じselection/filter/limit/lookahead/順序の一覧を再読する。親・一覧検査を省略/別条件へ変更しない。
3. 受付table順に同name条件で最終再読する。sys_id単独GETへ変えず、削除/同名再作成/重複も検出する。tableごとのslotは自身の再読/retryだけに使う。
4. 初回/最終のID/name/scope/版を比較可能な形で各jobへ供給し、親/metadataの結果と全table終端をprivateなFinalSourceSealへ結ぶ。
5. sealが同owner/source世代・active期限・整合性を満たした場合だけ、上位completionの確定へ進める。sealはレビュー全体の安全/完了証明ではない。

parent/metadataのchanged/unverifiedはsealにも保持する。tableだけ安定していてもBR-006候補を確定しない。tableのchanged/最終不足は当該BR-006をUnknown/partialとし、暫定候補を撤回する。initial不足やE枠閉鎖で最終をskipしたslotはattempt=0のまま、未確認理由を保持する。

非terminalな親/metadata再読失敗後も残時間/停止状態が許せば残slotを未確認として終端化できるが、stableへ昇格させない。401/403・全体期限/取消/全体受信超過では新GETを止めて失効する。legacy verify/旧final=trueを同新モードで別途呼ぶとinvalid_stateとし、予約の迂回を認めない。非BR-006経路のlegacy verifyは変更しない。

## 7. 実受信枠・予約台帳との接続条件

合成harnessを`{consumed:session.stats().requests}`で新生成して実transportへ重ねる方法は禁止。Cだけのコピーでは過去G/認証/時間/予約を失い、二重課金や予算の作り直しになる。**同じ実session内の単一の権威あるC/G/E/期限**を使用し、新モードを内部で一度だけ有効化する。

| 所有者 | 接続責務 |
|---|---|
| session transport | 既存認証固定、全HTTP210/C、全受信16MiB/G、1応答4MiB、証拠16KiB/256KiB/S/E、reader/abortの制御 |
| session予約owner | 初期親/metadata各2、table受付前C+R+4、R(T)=4+2T、用途slot参照、final順序/余剰解放/失効 |
| 固定source issuer | plan/table/phaseの承認、固定path/fields、raw body射影/版検査、receipt/cache/sealの一度限りの発行 |
| run/worker owner | 実workerの世代・要求/job・payload受領物との対応、観測配送、compare応答受理、上位診断保持 |

8table/16KiB/256KiBと予約方式は設計値で未承認。本案で運用capを投入しない。低減既存上限は尊重し、HTTP単体timeoutは10秒かつphase残以下。通常50秒・整合55秒・全体60秒（低減時は既存比例reserve）を延長しない。認証/初回/最終/retryはすべて210試行内、500/429等のretryは同logical read最大1回。

用途permitはsource/session/table/phase/slot/論理GETに結び、transportがfetch直前に消費する。普通のgetへ追加URLだけ渡して下位枠を省略したり、final booleanで他slotへ手を伸ばしたりできないようにする。chunkはG/Eへ各1回、超過chunkも課金し保持前に止める。sourceはbytesやCを再加算しない。

E枠だけの閉鎖は新証拠GETを止め、未処理table finalを未確認skipする。親/metadataの通常受信はG枠内で維持できる。G/全体停止をE不足へ格下げしない。通常試行枠不足は通常取得停止とfinal予約利用を区別する。HTTP失敗/JSON不正を新論理GETとして再発行しない。

## 8. 失敗時停止・上位診断

| 原因 | 固定処理/診断 |
|---|---|
| unknown/mismatched release・別permit/clone/閉じたsession | 追加取得前に拒否。release_not_admitted等を既存gateへ保持、別source/新認証で救済しない |
| source/selected payload/job/table/phaseの混入 | evidence_binding_mismatch/invalid_state/table_binding_mismatchでissuer/run owner停止 |
| 401/403 | authentication_failed/access_deniedで全体停止。cluster_state専用403例外をtable取得へ適用しない |
| 404/列不足/曖昧/不正shape/上流retry失敗 | 固定unavailable理由。scope既知へ変換せず、同論理phaseの新規作成禁止 |
| E/下位枠・T/受付余裕不足 | scope_evidence_limit/evidence_limitで当該BR-006未評価。R/C/Tの半端な受付はしない |
| C通常枠不足/G超過/期限/取消 | bounded設計の全体/phase停止契約を維持。first stage/codeと消費済み会計を保持 |
| 親/metadata/tableの版変更 | changed/unverifiedを保持。暫定候補を撤回し、別版の証拠へ差し替えない |
| cleanup未確認・late response | 受領/構文受理だけで完了証拠を出さない。primaryを保持しcleanupをunconfirmedのまま上位へ渡す |

新モードでcleanup未確認のbodyは、内部に暫定の検査結果があっても正常なTableReadReceipt/FinalSourceSealとして確定しない。先行失敗がなければ固定internal_review_errorで停止する保守的な案とする。通常の合成runはacceptedにcleanup状態を添えるだけだが、§11〜§12の専用body receipt／compositionにはconfirmed必須のgateを実装した。実transport用gateは未接続。実socket消失や物理メモリ消去の保証はしない。

停止/終了ではownerと用途permitを先に失効し、HTTP/read/retry/worker待機を中断する。late応答はcancelし、新receipt/sealを発行しない。slot/cache/本文/受領物への参照を解放し、同時実行枠/token snapshotは既存session.closeの所有責務で一度だけ解放する。pendingのworker終了は同じ残予算へ合流し、待ち終わらない場合にconfirmedと偽らない。

失敗後のissuer再生成・同phase再送・別世代へのjob移植は禁止。first primaryを後のclose/cleanupで上書きしない。公開0.2/0.3へ新しいstage/code/receiptを勝手に追加せず、接続契約の上位内部診断ownerへ固定理由を渡す。

## 9. 必須合成検証・承認待ち

| 区分 | 試験条件 |
|---|---|
| 発行前提 | active同session/source/permitだけ、unknown/mismatched/clone/別source/別session、metadata未選択、final後/終了後を拒否 |
| 一意性 | 同session別sourceの二重生成、生成失敗後再利用、返却ReleaseDecisionの書換え、同値scalar factoryからの偽造を拒否 |
| 固定要求 | method/path/fields/query/limit/offset等を合成境界で完全照合。name不正/global/追加列指定/任意URL/final booleanを拒否 |
| 受領物 | 他選択行/版変更/同形record/別payloadの混入、worker世代/request/job/hashの付替えを拒否。本文/余分な列/資格情報非出力 |
| 正規化 | 0/1/2/3件、必要列欠落、scope null/表示名/参照object、別name、同名再作成、版変更。Global aliasを推定しない |
| cache/順序 | 同名8名枠、複数jobでGET増加なし、初回/最終各1論理GET、失敗後再読拒否、親→metadata→tableの順序、legacy verifyの二重実行拒否 |
| 会計/中断 | C/R/S/G/Eの独立oracleとsource発行数を照合。下位/全体超過、50/55/60秒、retry/取消競合、E閉鎖skip、late受領/cleanup未確認 |
| seal/上位 | 親変更/一覧不明/table不足で確定しない。原観測共有とjob別消費を分け、raw wire/合成receiptから本番completionを生成できないこと |

未承認/未確認：実tableのACL/fields/Global応答、cap/予約値、cleanup未確認時の保守的停止案、予算ownerと実transportのprivate API、実worker plan発行/次版公開JSON。trusted workerは依然TCBであり、同一processの悪意あるコードや実行基盤の侵害を隔離する設計ではない。

次の実装単位は、まず**issuerの内部型・同session/source/permit claim・固定要求生成/正規化・合成受領物**までとし、合成発行元だけで前提を検証する。実transport許可先の変更や実worker接続は同時に行わない。

本工程は文書のみ。VM/監視/telemetry保留・Unknown・全体受付無効を維持し、実装・実transport/worker接続・実機操作・トークン発行・設定変更・実行permit発行は行わない。

## 10. 合成issuerの限定実装

`abort-scope-evidence-fixed-source.ts`はfactoryごとにsession/source/release permit/issuer/read/observationをprivateなWeakMapで認識する。いずれも合成handleで、実BoundedReadSession/ReleasePermitの受理口や互換castは作っていない。sourceのready/releaseの前提はfixtureにすぎず、実取得を証明しない。table版列の形式は検査するが、初回/最終の安定性比較や選択metadataの版結合は未接続。

生成時は既知のactive sessionのclaimを先に消費し、同sessionのsourceとその内部permitとの参照一致・親/metadata前提を検査する。sourceのclaimも一度だけ。失敗はsessionに固定理由を残し、正しいpermit/別sourceを用意しても同sessionでは再生成しない。成功済みsessionでの二重生成はissuer_claimedで拒否する。未知session handleでは有効なsessionを特定できず、その未知値だけを拒否する。

固定GETは§4.1のrelative path/paramsを生成するだけで送信しない。初回/最終の一度限りのread票、table最大8名、初回完了前のfinal開始拒否、最終table受付順を合成状態で検査する。通常phaseを閉じる時点で初回GETが未完了（中断でHTTP statusが無い等）なら、`enterFinal`に明示した閉鎖時刻で初回を`not_collected`として終端化し、その票の後からの完了を拒否する。閉鎖時刻を渡さない場合は従来どおり不正状態で停止する。初回unavailableのtableはfinal GETを行わず、`skipFinal`で受付順に`not_collected`のfinal観測（初回時刻以降・run区間内の時刻）を一度だけ発行する。初回が取得できたtableのskipと、初回unavailableのtableへのfinal GETは拒否する。同名cacheからのjob別配送、親/metadata最終再読とFinalSourceSealはまだ実装していない。再度beginして初回GETを作る操作は拒否する。

completeは同issuerのpending票を消費してから、合成frame（status/body_json/observed_at/cleanup）を一度だけclone/検査する。JSON bodyを0/1/2件・必要5列に正規化し、scope不正/列不足/不可視をUnknownとして扱う。name混入、時刻矛盾、frame不正、401/403、cleanup未確認で停止し、修正frameの再投入でも再開しない。frameの16KiB検査はfixtureの防御的境界であり、ストリーム受信をここで実装したものではない。

正規化receiptのviewは同issuerに限る合成検査用で、凍結した必要列だけを返す。繰返しview可能であり、上位結果へのone-shot delivery/completionではない。clone/他issuer/終了後を拒否し、raw bodyや余分な列を保持しない。session/source終了は次の操作で失効を検出する純粋モデルで、実I/Oを中断するhookではない。閉じたissuerのキャッシュは破棄するが、JS値の物理ゼロ化は保証しない。

実source receipt/選択payload/worker planの発行元、同じ実C/G/E/R/時計への結合、HTTP retry/再読/解放、実ACL・予算会計、最終seal・公開JSONは未接続。合成のoperator_config/observed区分もリリース実測の証明ではない。実行permitを発行せず、実transportの許可先も変えていない。

検証は[固定source基礎の合成記録](E2E_BEST_PRACTICE_ABORT_SCOPE_FIXED_SOURCE_SYNTHETIC_2026-10-25.md)。新moduleも既存`!dist/review/abort-scope-evidence*`の非同梱対象。VM/監視/telemetry保留・Unknown・全体受付無効を維持する。

## 11. 初回観測の合成stream接続

`abort-scope-evidence-source-stream.ts`は合成session/source/issuerとstream/予約台帳をprivateに所有する。初回接続時点の記録を本節、最終接続の追加仕様を§12に記す。fixtureのready/release前提は実証拠へ昇格しない。固定GET descriptorを合成callbackへ渡すが、fetch・時計・timer・実認証は導入しない。

streamはEOF・UTF-8・JSON受理・cleanup confirmedの後だけ、同harness／table handleに結合したopaque body receiptを発行する。receiptは最大1件を保持し、同tableで一度だけ消費する。コピー・他harness・別table・再消費・未消費中の再発行を拒否し、停止／closeで保持bodyを破棄する。通常のrunInitial／ordinaryにはbody返却を追加しない。生bodyを返すconsumeBodyは合成境界であり、実source権限や上位向けAPIではない。

compositionはread票／table handle／receiptを外へ公開せず、同じawaitの継続で受領bodyを消費して既存complete／viewへ渡す。statusは受理済み2xxを正規化用200として扱い、HTTP statusの実測証明は発行しない。必要5列のみの凍結観測を返し、余分な列やbodyは返さない。C/R/S/G/Eはstream／予約台帳だけが所有し、sourceの防御的文字列長検査・JSON正規化では再課金しない。失敗したretry bodyと超過chunkは返金しない。

初回版はstream失敗でcomposition全体を停止していたが、§12で404・retry枯渇・不正JSON・下位枠超過を局所unavailableとして継続する方式へ更新した。JSONの形から正規化されたunavailable（0件・必要列不足等）もUnknownとして区別する。認証・binding矛盾・全体停止は格下げせず、first codeを保持してissuer/session/sourceとbodyを失効させる。cleanup不明は受理bodyがあってもinternal_review_errorで停止する。close／取消後のlate応答で観測を返さない。

**残課題:** §12の合成最終接続を実source／選択metadata/payload／worker jobへ結合すること、同名cacheのjob別配送、上位診断ownerへの接続。本compositionを実sessionへ転用しない。60秒／210試行の実上限は変更せず、共有時計や実transportへの結合は未実装。公開規則・結果JSON・本番permitは変更しない。

検証は[初回source／stream一体接続の合成記録](E2E_BEST_PRACTICE_ABORT_SCOPE_SOURCE_STREAM_SYNTHETIC_2026-10-26.md)。VM/監視/telemetry保留・Unknown・全体受付無効を維持する。

## 12. 合成最終再読・局所継続・seal

### 12.1 基準値と固定要求

sealが必要な合成runは、table初回より先に`prepare`を一度だけ行う。同じstream／台帳の通常枠で親→metadataを読み、正規化した基準値をprivateに保持する。ready fixtureのbooleanだけを基準値へ昇格させない。従来の初回単独試験はprepareなしでも可能だが、prepare未実施ではfinalizeを拒否する。

| 対象 | 固定条件・必要列・上限 |
|---|---|
| 親 | sys_update_set、sys_id完全一致＋ORDERBYsys_id、sys_id/sys_updated_on/sys_mod_count、limit=2、正常1件必須 |
| metadata | sys_update_xml、update_set完全一致＋ORDERBYsys_id、sys_id/update_set/name/sys_updated_on/sys_mod_count、limit=101、正常0..100件 |

offset=0、no_count=true、display_value=false、exclude_reference_link=trueを固定し、初回と最終で同じdescriptorを使う。metadataは順序の昇順・重複なし・update_set一致を要求し、101件はlookaheadのため不完全として扱う。payload/scriptは要求・保持・返却しない。余分な応答列は射影時に捨てる。これは**all-metadata最大100件の合成subset**であり、既存0.3のreview_targets選択を接続したものではない。

### 12.2 最終順序と局所終端

`finalize`の開始claimをawait前に消費し、streamとissuerをfinalizingへ移す。予約slotで親→metadata→受付順tableを一度だけ処理し、最後に全table終端・予約残0・confirmed cleanupと終了checkpointを検査する。親／metadataのchanged・局所失敗でも残slotを終端化するが、stableへ格上げしない。並行finalize・二重finalize・final後のinitialは全体停止する。

404・retry枯渇・不正JSON・下位証拠capは固定unavailable理由と診断を保持する。HTTP成功を捏造せず、issuerの`completeUnavailable`がpending票を消費して局所観測を作る。正常200でも0件／不正scope等なら台帳の初回availableを一度だけunavailableへ下げ、final GETなしのskipを可能にする。初回不足のtableはissuer／台帳の両方をskip、E閉鎖のavailable tableは最終票を未収集として終端化する。いずれもCは増やさず、予約を一度だけ解放する。

401/403、G・通常応答上限超過、取消／deadline通知、名前・source binding矛盾、順序違反、cleanup未確認は全体停止。局所理由を診断へ残していても全体停止を局所不足へ格下げしない。診断は固定stage/codeの組を重複排除し、繰り返し受付拒否で無制限に増やさない。close／stopで保持body・基準値・table・seal参照を破棄し、primaryを後続操作で上書きしない。

### 12.3 sealの限定的な意味

初回／最終の親とmetadataが完全・同一で、全tableのID/name/scope/版が同一、scopeが非null、全予約が終端・cleanup確認済みであり、受付拒否がなかった場合だけopaque `SyntheticScopeFinalSeal`を発行する。変更があればchanged、不足があればunverifiedを返し、sealはnullにする。changedと不足が同時にあればchangedを返すが、個別unverified診断も保持する。

sealは同composition ownerのMapに結合し、`consumeSeal`は一度だけ消費して`synthetic:true`の限定summaryを返す。clone・他owner・未発行・二重消費・close/stop後は拒否する。issuerの`finish`／sealed状態は全tableの終端だけを示し、それ単独でstable sealを発行しない。raw body・認証・公開JSONへの投入口は設けない。

sealは合成callerが受付したtableとこの固定metadata一覧の比較証拠であり、payload/jobとの対応、リリース実測、実認証、レビューの安全・網羅性、BR-006候補の確定を保証しない。実selectionのreceipt・worker delivery・上位completionとの結合は未実装。

### 12.4 会計・時間・残課題

C/R/G/Eはprepareから最終まで同じ所有者を使い、JSON正規化／比較／sealで再課金しない。既定1回成功・1tableはprepare2＋initial1＋final3＝6試行、2tableは8試行。retryは同slot最大2試行で、失敗body・超過chunkを返金しない。E閉鎖は親／metadataを止めず、G超過は停止する。

合成時刻はISO区間内・非逆行を検査し、deadline通知／AbortSignalで待機を中断する。**実時計・50/55秒のphase watchdog・全体60秒の自動強制中断はこのmoduleにはない**。既存実経路の60秒／210試行を緩和したものではなく、そのownerへ接続するまでは合成試験専用とする。実transport／worker、選択payloadとの対応、job別配送、上位診断owner・公開結果への接続は引き続き残課題。

検証：[最終source／stream合成記録](E2E_BEST_PRACTICE_ABORT_SCOPE_FINAL_STREAM_SYNTHETIC_2026-10-26.md)。VM/監視/telemetry保留・Unknown・全体受付無効・本番permit非発行を維持する。

## 13. 固定sourceとWeb Streams受領物の結合（fixture限定）

`abort-scope-evidence-fixed-web-source.ts`は§12の親／all-metadata／table要求条件を、分離したfixture ownerと注入Web Streams adapterへ接続する。外部からURL・query・fields・HTTP status・観測時刻・raw body・用途permitを受け取らない。注入Response供給関数へ内部生成GET descriptorとAbortSignalだけを渡す。実HTTP／実sourceのReleasePermit／worker planへの接続ではない。

`prepare`は親→metadataの基準値、`initial`はtable初回、`finalize`は親→metadata→table受付順の再読を行う。同名初回は凍結投影をcacheし、追加GET／課金をしない。並行開始・再finalize・終了／失効後のcache参照を拒否する。table名は合成callerの検証済み文字列であり、実workerの取得証拠ではない。metadataはall-metadata最大100件のsubsetで、実0.3 selection／payloadへの結合は未実装。

`consumeSourceBody`は同machine／用途permit／phaseの未消費receiptだけを一度消費する。raw JSON値は外へ出さず固定schemaの必要列だけを新objectへ投影する。tableは既存issuerと共通の純粋normalizerで必要5列・0/1/2件・Global／null・name一致を検査する。parent／metadataはid・所属・版・昇順・最大100件を検査する。余分な列／外側キーを捨て、任意projector callbackやpayload取得口は作らない。コピー／別票／再消費／失効は固定理由で停止する。

statusは取得時の捕捉値、`observed_ms`はcleanupと終端clock確認後の同予算の経過時計値をreceipt内部に保持する。caller申告の200／ISO時刻で代用しない。tableの`observed_at`は**1970-01-01を0とする経過時計の合成ISO表現**で、実wall-clock／PDI観測日時ではない。投影後と最終集約前にも同clockでcheckpointを行う。正式wall-clockへの結合は別工程。

初回JSONの意味検査でunavailableになった時だけ、同receipt消費中に会計ownerのavailableをunavailableへ下げる。成功への昇格口はなく、finalはGETなしのslot skipで未使用Rだけを一度解放する。初回outcome=`body`は取得診断として保持し、意味検査の不足理由とは分ける。404／retry枯渇／構文不正／証拠cap不足は固定理由を保持して残slotを継続する。認証／binding矛盾／取消／全体停止／cleanup未確認は格下げしない。retry前にphase枠が尽きても受付済みslotを捨てず、final未実施終端へ残す。

単一fixture ownerがC/G/E/R／retry／時計を所有する。投影・cache・比較は再課金せず、失敗body／超過chunkを返金しない。table最終取得前のE閉鎖もowner由来skipで残予約を解放する。親／metadataはskip不可。summaryはstable／changed／unverified・固定理由・`synthetic:true`・`evidence_issuance:disabled`・`seal:null`。親／metadata変更・不完全・scope nullでレビュー結果を確定しない。**stableでもseal／正式証拠／公開completionは発行しない。**

残課題：実認証snapshot／sourceのReleasePermit／selection・payload receipt／worker jobの結合、本番専用issuerと非共有claim台帳、最終sealと上位診断、cap承認、実HTTP cleanup保証・全体work上界。旧§11／§12のraw合成frameやsealを新経路の取得証明へ流用しない。新moduleも`!dist/review/abort-scope-evidence*`の非同梱対象。VM／監視／telemetry保留・Unknown・全体受付無効を維持する。

検証：[固定source／Web Streams結合の合成記録](E2E_BEST_PRACTICE_ABORT_SCOPE_FIXED_WEB_SOURCE_SYNTHETIC_2026-10-26.md)。

後続の[transport設計§17](BEST_PRACTICE_ABORT_SCOPE_TRANSPORT_RECEIPTS_DESIGN.md#17-未認証fixtureのoauth-bootstrapと固定失敗分類)は未認証fixtureのOAuth bootstrap・ready遷移と固定診断を実装した。OH-03で認証後の同transportから本固定sourceへprivate採用する経路も接続したが、二度目のfactoryによる会計作り直しは認めない。実session／token／ReleasePermit／workerの取得証拠は引き続き未接続。

[worker接続設計§11](BEST_PRACTICE_ABORT_SCOPE_CONNECTION_CONTRACT_DESIGN.md#11-検証専用workerとfixture上位結果の接続)では、stable final後の`consumeObservations`による一度限りの正規化データdeliveryを追加した。実worker threadとの合成結合までを検証し、changed／unverified／失効／再消費を拒否する。正式receipt／job binding／sealを発行したものではなく、本番発行口の閉鎖は維持する。

[OAuth→source移譲詳細設計draft-0.5 §13](BEST_PRACTICE_ABORT_SCOPE_OAUTH_SOURCE_HANDOFF_DESIGN.md#13-oh-03同transportの固定source-private採用初回最終と予約解放)では、OH-03として同transportを本module内の非export coreへ採用し、prepare／initial／finalize／deliveryを接続した。OAuth ownerも同moduleへ置き、旧handoff moduleは互換facadeとした。`adoptSource`は同runのticketだけを一度消費し、任意adapterの登録やprobeからの昇格はできない。C=7/8・R=0、局所失敗skip・E閉鎖時の最終retry解放を合成検証する。OAuth後にprepared ownerをfake ready値で作る循環や、二度目のtransport claimは採らない。実session・正式証拠発行は閉鎖のまま。

同設計[§14の連続合成E2E](BEST_PRACTICE_ABORT_SCOPE_OAUTH_SOURCE_HANDOFF_DESIGN.md#14-oauth起点のworker上位結果までの連続合成e2e)では、このOAuth起点からnormalized delivery→実worker IPC→fixture上位結果までを確認した。外側取消・残時間の結合はtest-only ownerが担い、正式なpayload／worker job由来のissuerや公開MCP経路への接続は追加しない。会計値をworker処理前後で保持し、取消時は暫定比較を撤回する。
