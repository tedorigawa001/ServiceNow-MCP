# AU-BR-006：スコープ証拠の取得・版・同一性の詳細設計

Version: br006-scope-evidence-draft-0.2 / Date: 2026-10-25。
Status: **内部型・純粋比較器を合成検証。取得・真正性/one-shot所有者・MCP接続・実機確認・人による採用承認は未実施**。
AU-BR-006は未登録のまま。明示14規則・既定3規則・現行JSON契約を本書では変更しない。

## 1. 根拠・既存境界・目的

台帳AU-SRC-001の[Australia Classic Business rules](https://www.servicenow.com/docs/r/australia/api-reference/business-rules-classic/c_BusinessRules.html)、Example business rule scripts → Abort a database action in a before business-rule（Note）を根拠とする。異なるスコープのBRからのcurrent.setAbortActionが尊重されないという前提を確認する規則で、実際の中止成否を静的に認定するものではない。

2026-10-25の公式検索結果ではAustralia表示と上記前提を確認したが、同リリースURLの直接本文取得は失敗した。原文全文の再取得・人の採用承認・原文hashは未完了。台帳のverified_onは変更しない。Globalと32桁IDの対応を保証する公式根拠も今回確認できていない。

現行実装を読み取り専用で照合した結果：

- XML抽出はBRのpayload内sys_scope（global/32桁小文字16進/null）とcollectionを返す。対象テーブルの所有スコープは未取得。
- bounded transportの許可先はsys_update_set/sys_cluster_state/sys_update_xmlだけ。sys_db_objectへの経路はまだ無い。
- 認証/接続先を呼出し開始時に固定し、リリースmatchedの内部permit後だけmetadata/payloadを取得する。sys_cluster_state固有の403処理を除き、401/403はsessionを停止する。
- 予算は全体60秒、取得/解析は通常50秒まで、最終照合は55秒まで、残りで集約。受信全体16MiB・1応答4MiB・全HTTP最大210試行・最終親/一覧用4試行を予約する。

本案は[BP-5統合設計](BEST_PRACTICE_BP5_MCP_DESIGN.md)を維持する追加設計。既存[AU-BR-005](BEST_PRACTICE_ABORT_ACTION_BR.md)の後続処理解析と、BR-006のスコープ比較は別規則にする。

## 2. 初期対象・候補を作る前提

初期対象は保存payload版sys_script.script、when=before、current由来と判別できる1引数setAbortAction(true)だけを提案する。既存の字句scope・限定alias/定数評価を再利用するが、BR-005の「後続処理あり」を発行条件にはしない。単独の中止呼出しでもスコープ前提は関係するため。

- falseだけ、独自同名メソッド、別のGlideRecordは当該候補にしない。不明receiver/引数、未対応の呼出し/改変は未解決。
- after/async/display、不明whenはmissing_context。条件欄やAbort actionチェックボックスで本文呼出しを代用しない。
- collection=globalはGlobal Business Ruleの文脈であって、対象テーブル名やsys_scope=globalの証拠ではない。対象テーブル未特定として扱う。
- 参照するのは宣言されたcollectionの所有スコープ。継承テーブル上の実レコードや動的なcurrentの実テーブル、呼出し先の実行スコープは確定しない。親テーブルのスコープをすべての子テーブルへ流用せず、階層の再帰探索もしない。

## 3. 取得経路と要求最小化

### 3.1 内部経路

1. 従来どおり入力/親/リリースを検証し、同じbounded session・permitで選択範囲内のpayloadを取得する。
2. workerで拒否型XML抽出・BR識別・AST解析を実施し、上記呼出しがある場合だけ、内部の計画にcollection・BRのscope・payload/code hash・可視資産ID・呼出し位置を結び付ける。collectionは抽出器と同じ英小文字開始/英数字underscore/最大80文字の制約。任意query/URLを受け付けない。
3. 同じsessionから、内部で固定生成したGETで宣言テーブルの現行設定を取得する。利用者のtable/query/fields指定や別clientは使わない。
4. 初回観測を当該呼出しのメモリ内だけで共有し、追加候補を暫定作成する。別のcall/認証キーへのcache共有は禁止。
5. 最終照合phaseで同じname条件を再読し、ID/所属scope/版を比較する。既存の親/metadata照合も省略しない。全証拠が安定するまでBR-006結果を確定しない。
6. 最終観測をworkerの候補・集約検証に渡し、未解決/変更を保持した本文なしの結果を生成する。

workerの計画と追加証拠の受渡しは同じjob/instance binding/認証snapshot/対象payload hashに結合し、一度だけ完了させる。MCP引数でscopeの値や「確認済み」を注入できる口は作らない。main側で別の簡易XML/正規表現抽出器を追加せず、同期解析のworker化・中断を維持する。具体的な内部メッセージ型は後工程で設計/検証する。

### 3.2 固定GET案

| 対象 | 許可する要求・検証 |
|---|---|
| 現行テーブル定義 | `/api/now/table/sys_db_object`、固定query `name=<検証済みcollection>^ORDERBYsys_id`、limit=2、offset=0/no_count=true |
| fields | sys_id,name,sys_scope,sys_updated_on,sys_mod_countだけ。display_value=false、exclude_reference_link=true |
| 初回/終了時 | 同じname条件を各1回。2件目は同名重複検知用。先頭1件を黙って採用しない |
| 正常1件 | sys_idは32桁小文字16進、name完全一致、scope/版が明示的に読めること。正常0件と不可視を区別できなければnot_found_or_not_visible |
| 正常2件・列欠落・reference object/表示名応答 | 同一性/証拠不足。名前一致やGlobalという表示文字列だけで補完しない |

これはfields/ACL/Globalの実応答をまだ検証していない提案経路。実装ではtransportにsys_db_objectを単純追加するだけでなく、このsourceの固定用途・fields・条件・件数・phaseへの制限を接続する。sys_scope/sys_app/BR現行本文/sys_dictionary等の追加照会は初期案に含めない。

再読はsys_id単独でなくname条件も再検証し、削除後に同名の別レコードが作られた場合や重複も検知する。SQL/encoded query断片の連結を呼出し入力に許さず、検証済みnameをURLSearchParamsで符号化する。

## 4. payload版と現行設定を混同しない

| 証拠 | 由来と意味 | 認めない解釈 |
|---|---|---|
| BRのscope/collection | 取得したsys_update_xml.payload版。payload_hash・Update XMLの版/取得時刻に結合 | 現行BRやインストール時点の有効設定と同一 |
| テーブルscope | 現行sys_db_objectのcaller ACL内の観測。初回/最終の時刻・ID・版に結合 | payload作成当時/適用先の所有スコープ |
| 両者の比較 | `payload_vs_current_declared_table`という時点の異なる文脈比較 | 同一時点の実スコープ照合、実行経路確認、中止成功/失敗の確認 |

初期案はこの混在を必須limitationsにして、低確度の条件付き確認候補だけを許す。現在のBR本文/設定への黙った差替えは禁止。同一Update Setにテーブル定義があると推測してmetadata範囲外を探索したり、選択外payloadを追加取得したりしない。

将来のpayload同士の比較は別方式とし、対象テーブル定義の版・識別・更新順・依存関係を証拠化するまで未対応。現行観測が安定していてもpayload当時の状態、他インスタンスへの適用後、可視範囲外・観測間で元に戻る変更は証明できない。

## 5. Globalとsys_idの同一性

内部では次のタグを分ける：`global_literal`、`scope_record_id(32桁小文字16進)`、`unknown(固定理由)`。globalは既存payload契約が扱う特殊値で、一般の32桁IDではない。空/null/欠落/表示名/不正形式をglobalへ既定化しない。`Global`の大文字表記・空scope名・sys_package/applicationからも推定しない。

| 入力組合せ | 許す比較結果 |
|---|---|
| global_literal同士 | 同じ特殊値。ただし§4の時間差・実テーブル未確認は残る |
| 同一の32桁ID同士 | 同じ参照IDという観測。scopeレコードの存在/名前/実行可否まで保証しない |
| 異なる32桁ID同士 | 異なる参照ID。異なるscopeの可能性を確認候補にするが、実行時の名前空間/中止成否は認定しない |
| global_literalと32桁ID | **対応未証明なのでunknown**。単純な文字列不一致を別scopeの証明にしない |
| どちらかunknown | 比較不能。等価/非等価のいずれも作らない |

32桁の「Global ID」をハードコードしない。初期案ではGlobal↔32桁のalias解決を行わない。将来解決する場合は、同じ接続先/認証snapshotからの権威ある対応証拠・根拠仕様・取得/recheck予算を別途承認する。表示名がGlobalというだけのレコードや会話/設定からの申告では解除しない。

comparisonは`same_literal`/`same_reference`/`different_reference`/`unknown`程度の観測区分とし、無修飾なscope_match=trueやeffective_scope_verifiedは設けない。現在のtarget.sys_scopeはpayload由来のまま保持する。

## 6. 証拠の内部契約・寿命・結果

内部証拠は、同一run/job、instance binding、認証snapshotの内部identity、update_set/update_xml ID、payload/code hash、collection、BR scope token、現行テーブルID/name/scope token、初回/最終のsys_updated_on/sys_mod_count/時刻、観測状態・理由を保持する。別資産/別runの値を転用しない。認証トークン・principal hashは結果/ログへ出さない。

public結果は観測方式・時間差・比較区分・証拠のrun内ID・固定理由と確認項目に限定する。現行テーブル名/ID・追加scopeの生値・原レスポンス・資格情報・コード本文は新たに露出させない。既存targetのpayload scopeとは区別する。証拠を省略する場合も未確認理由を消さない。

| 構文と証拠 | BR-006の提案扱い |
|---|---|
| 対象呼出しなし/false/確定した独自receiver | 限定構文の評価結果は候補0。実scope適合を承認したことにしない |
| 対象呼出しあり、安定観測でdifferent_reference | info/low/candidate。payloadと現行の時間差・宣言テーブルだけの比較・実中止未検証を必須化 |
| 対象呼出しあり、same_literal/same_reference | scope差の候補0。時間差/実テーブル未確認の制限は保持し、実行成功や安全とはしない |
| receiver/対象表/BR scope/テーブルscope不足、Global alias未証明 | missing_context等で未評価/未解決、BR-006候補は捏造しない。analysis_complete=false、固定理由を保持 |
| 初回/最終でID/name/scope/版が変化、最終照合不能 | BR-006の暫定候補は撤回し、未評価・changed/unverified・partial。既存の他規則の解析結果は従来の失敗契約の範囲で保持 |

必須確認項目案は「BRと宣言テーブル/実レコードのscope、時点/適用先、実際の中止挙動、必要な業務処理の確認」。BR-005の後処理確認と統合しない。厳密な語彙・JSON版・coverage理由は後工程で列挙型として定義し、必須証拠欠落/矛盾をstrict検証で拒否する。

scope証拠を現行のstrict JSONへ勝手に追加しない。次版の1件/集約契約とworker内部契約の設計が実装前の前提。BR-006を要求しない既存0.2/0.3・固定評価セット・既定規則は維持する。本書ではversion番号や登録数を先行変更しない。

## 7. 共通予算・予約・中断

以下は**新しい本番設定ではなく提案する追加費目の上限**。既存の上限を引き上げない。

| 費目 | 提案枠・会計 |
|---|---|
| 異なる宣言テーブル | 1run最大8名。選択資産の処理順に受付。超過分のBR-006だけ証拠上限で未評価、別名や別APIで迂回しない |
| テーブル読取 | 1名につき初回/最終各1論理GET、各最大2 HTTP試行。最大32試行は既存210試行の内数 |
| 受信 | 証拠GETは1応答16KiB・証拠合計256KiBを追加の下位上限とする。全retry/再読/失敗応答も全体16MiBと両方へ課金。32×16KiBをすべて受理できる予算ではない |
| 元の上限 | 1応答4MiB、payload2MiB/累計8MiB、metadata最大100+lookahead、出力256KiB、指摘100等を維持 |
| CPU/保持 | workerの同じAST/深さ/候補予算を共有。証拠表/計画は8名・選択100行・候補100の範囲内。独立した無制限走査/cacheを作らない |
| 時間 | 認証・追加GET・再読・retry・解析/集約・worker終了待ちを同じ60秒で扱う。HTTPは最大10秒かつphase残時間以下。50/55秒の内部境界を延長しない |

現行transportには証拠専用のストリーム下位上限・動的な最終試行予約が無いので、実装時に必要。応答を全量読んだ後だけで16KiBを検査する方式は不可。既存の通常payload経路の上限を緩めたり、予算を別sessionへ分散したりしない。

受付済みテーブル数Tについて、最終phaseの試行予約を **R(T)=4+2T** とする案。4は従来の親/一覧再読（各retry込み）、2Tはテーブル最終再読（各retry込み）。T=8なら20。新しいnameを受け付ける**前**に予約を増やし、少なくともその初回最大2試行と残予約が210内に収まることを確認する。通常取得は`requests < 210 - R(T)`を守る。最終テーブル再読と親/一覧には予約内訳を個別に持ち、一方で他方の予約を消費しない。

最悪の初回/最終テーブル各16試行に、必要時の既存OAuth認証最大2、親/リリース/一覧の初回最大6、既存最終4、payload最大200試行を足すと244試行になり、210内には収まらない（cached token/per-userなら認証交換分は不要）。したがって「最大100 payload＋全8テーブル＋全retryを完遂」は保証しない。枠不足では受付/新規取得を止め、未処理理由を残す。上限を増やして救済しない。

50秒前に行う初回GETと、55秒前に行う最終GETを区別する。最終予約があっても残時間/受信量を増やす根拠にしない。中断時はHTTP body cancel、worker終了、session解放を既存の所有者が行い、別の延長timerを作らない。

## 8. 失敗分類・認証固定

| 事象 | 扱い |
|---|---|
| 正常0行/404 | 不在と不可視を区別せず証拠不足。BR-006は未評価。名前の類似検索/権限別fallbackなし |
| 正常2行・scope/版欠落・不正形式 | 重複/部分可視/不正証拠の固定理由。空値をglobalに変換しない |
| sys_db_objectの401/403 | **既存どおりsession全体を停止**。cluster_state固有のfallback例外を拡大しない。partial/failedと収集済み結果はBP-5の既存契約に従う |
| 429/5xx/timeout | 現行と同じ最大1retry、同一session/認証・予算内。枠が尽きれば停止/未評価。別API・別認証で再取得しない |
| 下位の証拠256KiB/8名枠超過 | 新しい証拠取得を止め、当該BR-006を未評価。既存全体上限に先に達すればその全体停止を優先 |
| 全体受信/試行上限・取消・hard deadline | 従来の停止/固定エラー契約。新しい「証拠不足」へ矮小化して継続しない |
| soft deadline/最終再読失敗 | 不完全な証拠に基づくBR-006候補を返さずpartial。残り資産・証拠は理由付き未処理 |
| 内部identity/hash不整合・矛盾したstrict結果 | 内部エラーで停止。旧契約へ黙って落としたりunknownを同一へ変換しない |

追加GETも初回固定のinstance URL/auth mode/tokenを使用。per-user不足をservice-accountで救済せず、ACL/ロール/共有API policyを変更しない。403や最終観測不能は生message/stackなしの固定理由にする。権限の追加を利用者へ自動要求/付与しない。

## 9. 実装前の決定・合成検証条件

未承認事項：この時点差付き候補の採用、8名/16KiB/256KiBと予約方式、次版JSON/語彙、worker計画の寿命、sys_db_objectの実fields/ACL/Global実応答。sys_scopeによるalias解決は初期案から除外したまま。実機確認は別途明示承認が必要。

合成試験を先行し、少なくとも次を確認する：

1. payload/別資産/別run/別認証の混入、古いjob計画の再利用拒否。MCP引数から証拠注入できないこと。
2. global/global、同一ID、別ID、global/ID、null/空/列欠落/表示名。Global名だけの偽対応を拒否すること。
3. payloadと現行BRが異なる場合もpayloadを保持。collection=global・継承/動的対象を勝手に補完しないこと。
4. 0/1/2行、フィールドACL欠落、同名差替え・ID/scope/版変更、観測間に戻る変更の未検出限界。
5. false/別receiver/unknown、before以外と、BR-005併用の独立性。scope不足を候補0の「適合」にしないこと。
6. 401/403全体停止と0件/404の証拠不足の区別。再認証/別資格情報/経路fallbackがないこと。
7. T=0/1/8/9、2試行retry、R(T)予約の先取り/非流用、受信ストリーム下位/全体上限、50/55/60秒・取消と資源解放。
8. 最終証拠が不安定ならBR-006暫定候補を撤回し、他規則の既存結果・coverage・診断を矛盾なく保持すること。
9. 原payload/現行応答/コード/秘密が出ないこと、旧要求の契約・固定評価・既定3規則が変わらないこと。

draft-0.1は設計のみだった。draft-0.2で以下の内部型/比較器だけを実装した。取得/公開schema生成・環境/PDI操作・設定変更・Pushには進まない。VM/監視/telemetry調査は保留、Unknown・全体受付無効、本番cap/完成parts/permit非発行を維持する。

## 10. 第1段階の実装範囲（draft-0.2）

[abort-scope-evidence.ts](../src/review/abort-scope-evidence.ts)に以下を追加した。既存レビュー経路からはimportせず、npm配布対象からも除外し、梱包検査で非同梱を確認する。BR-006登録・公開JSON契約・ASTでの中止呼出し検出・Table API許可先・認証・受信/試行上限は変更していない。

- normalizeScopeTokenはglobal_literal/scope_record_id/unknownへ分類するだけで、Global alias照会・大小文字変換・空値補完をしない。
- contextはinstance binding、対象ID、payload/code hash、開始時刻・内部の期限値（1〜60,000ms）を構造検証して固定する。payload証拠と初回/最終の観測を、同じcontextオブジェクトに結合したopaque handleに保持する。同値の別context、handleのコピー/偽造は比較時に拒否する。外へJSON化しても内部metadataは出ない。
- payloadと現行テーブルは別source/target_version。利用者の入力や現行BRへ差し替えない。payload ID/hash、宣言collectionと観測name、初回/最終phaseを照合する。
- 行は配列長を先に0/1/2へ制限する。0件・2件・列欠落・形式不正・取得不能を固定理由で保持し、scope欠落同士を等価とは扱わない。認証/ACL・取消・全体期限の失敗をunavailable理由として受け入れず、上位停止を置換しない。
- 比較結果はcompared/insufficient/changed/rejectedと観測上の比較区分だけ。候補・違反・analysis_complete・中止成功を発行しない。すべての結果で時点差・実テーブル/実行/中止未確認・観測非原子性を保持する。
- supplied timestampが同runの開始/初回/最終/比較時刻の順序を満たし、比較時刻が開始+期限より厳密に前であることを検査する。同run内の共有table cacheを考慮し、初回テーブル観測が後続payload取得より先でもよいが、最終再読は両方より後でなければならない。
- ID/name/scope/版の変化や最終取得不能では、初回だけでsame/differentを出さずunknownと固定理由に落とす。結果は固定列挙値と凍結したlimitationsのみで、生table名/ID・追加scope値・原エラーを返さない。

**重要な未実装境界**：factoryは構造検証/スナップショットを行うが、渡されたデータが実際の認証session・worker/取得元から来たことを証明しない。contextの本番生成owner、権威あるissuer、終了時の失効/破棄、one-shot、workerをまたぐ受渡しは未接続。opaque handleはprocess/realmローカルで、structuredClone/JSONをworker間の証拠移送に流用できない。table cacheを複数資産で使う場合も、将来の所有者が同じrunの原観測を各対象contextへ再結合する必要がある。

この境界を[証拠生成owner・一度限りの消費の詳細設計案](BEST_PRACTICE_ABORT_SCOPE_OWNER_DESIGN.md)へ具体化した。発行元限定、実session/worker世代・asset jobとの結合、状態遷移・失敗後再利用拒否・終了時の受理権限失効を対に設計する未実装案であり、本番の真正性を確認済みとは扱わない。

純粋比較は同じ入力で繰り返し可能であり、消費操作やpermit発行ではない。Date.now/タイマー/HTTPを呼ばず、入力時刻の整合を見るだけ。実際の60秒の中断、取消、受信ストリーム制限・予約会計は既存owner/transportに接続する後工程の課題で、今回達成したとは扱わない。

候補となるsetAbortAction(true)の有無、before/receiver等はこの比較器の引数にも推論対象にもしていない。比較結果からルール候補を生成する前に、構文証拠・次版JSON契約・実取得証拠を結び付ける必要がある。[合成検証記録](E2E_BEST_PRACTICE_ABORT_SCOPE_EVIDENCE_SYNTHETIC_2026-10-25.md)を参照。
