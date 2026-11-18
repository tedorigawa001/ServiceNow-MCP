# AP01：個別承認用の残差台帳・未レビュー／重複と通常経路の維持条件

Version: release-ap01-individual-approval-residual-ledger-draft-0.3 / Date: 2026-11-19。
Status: **個別承認の材料。公開方針だけ採用済みで、保証低下の受容は全件未承認・処遇未選択。** 基準HEADは`5dec892`。[AP01親文書](BEST_PRACTICE_RELEASE_AP01_LIMITED_SCOPE_DESIGN.md)の①審査対象／範囲、②通常経路の維持、③失われ得るassertionと回復責務を一体で整理する。文書完成・明示対応・旧試験の存在を、保証回復や承認可能との判定にしない。

draft-0.2の個別照合基準は`ff18189`。初稿の44行索引からSA-02〜04を本書の追加専用行A1-S01〜03へ対応付け、その時点の文書対応122・閉鎖laneの残未レビュー41を記録した。draft-0.3は`2f8d3f0`を基準にSA-06〜08をA1-S04〜06へ追加。6レビューの明示119旧caseという基準値は書き換えず、本書追加6を含む現文書対応125・閉鎖laneの残未レビュー38を別集計する。追加6行の旧case分類は部分対応のままで、保証回復・実行同等性・個別承認は追加しない。

保証低下・旧試験削除／skip／期待値弱化・friend撤去・設定変更・公開は未承認。正式発行口閉鎖・全体受付無効・通常経路未切替・C実行入口／body起動閉鎖・Unknown・VM／監視／telemetry調査保留を維持する。LOAD6／LOAD7選択、元5秒期限・既定並列度、旧比較childの60秒・製品全体60秒・元attempt floorも変更しない。今回はMDと親文書参照だけ。実装・発行／claim消費・試験再実行・build／pack・負荷採取・実接続・実通信・実機操作・コミット・Pushは行わない。

## 1 台帳の意味・承認単位

本書の「明示対応あり」は、NSレビューまたは本書の追加専用case行から正規旧caseへの対応があるという文書上の状態に限る。本文で名前を挙げただけのcase、Dの候補リンク、単体の関連試験は数えない。「未レビュー」は**NS01〜06にも本書の追加専用行にもなく、直接assertionを個別に整理していない**ことで、過去の移行台帳や試験が存在しない意味ではない。旧分類の部分対応／未対応／維持、実行同等性、今回の承認状態は独立した列である。

個別承認単位は「旧case ID＋元revision／入力variant＋assertion参照＋故障位置＋対象lane／artifact」とする。NS群全体・本書1行の要約・成功件数だけの一括承認は行わない。同caseが複数レビューにある場合は元caseを一つにし、両方の回復条件を参照する。旧caseの直接assertにない専用post・全解放・全graph不在等は追加受入条件として分離し、「失う既存保証」に遡及加算しない。

| 記録する状態 | 本書での扱い | 承認へ進む前の条件 |
|---|---|---|
| 通常経路の維持 | 維持必須。保証低下受容の候補外 | 共通生成・会計・closeを切り分けてもKP01〜05を弱めない |
| 閉鎖laneの旧assertion | 現在は旧試験を保持。将来の保証低下受容は未承認 | 元assertion・失われる範囲・代替不能点・責務先・回復条件を明示して個別審査 |
| 未レビュー | 未個別照合・審査保留 | 元test本文と元artifactを読み、code／count／注入位置／診断層を確定するまで受容票を確定しない |
| 未確認／追加条件 | Unknown／未実施のまま保持 | 旧保証の喪失と、旧試験も確認していなかった保証不足を区別する |
| 入口撤去／試験切替／公開 | AP02〜06等の別gate | AP01で非提供にしたことから実施承認・不在証明・公開可を推定しない |

## 2 正規母集団・明示対応・未レビューの棚卸し

正規参照は[case別移行台帳](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md)の旧176行＋後続52variant＝228行。これは試験全体の母集団ではない。旧330case表のKEEP／US／EK／ET148行とFR6行は[元表](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md)側に残し、228へ足して移行率を作らない。今回fullNameを実行再発見せず、元宣言・variantを正規リンクで保持する。

次の2表と119／109の集計は、初稿で固定した**6レビューだけの明示対応基準**である。本書の追加個別照合を含む現在値は直後の追加表へ分け、過去の記録・6レビュー本文を変更しない。

| 旧群 | 正規行数 | 6レビューの専用case行に明示対応する旧ID | 重複除外後の対応数 | NS専用行なし |
|---|---|---|---|---|
| SA | 26 | SA-01・05 | 2 | 24 |
| SAB | 11 | SAB-01〜11 | 11 | 0 |
| ND | 30 | ND-01・02・07・08・16・18・19 | 7 | 23 |
| NDB | 8 | NDB-01〜08 | 8 | 0 |
| ACK | 37 | ACK-01〜37 | 37 | 0 |
| ACKB | 2 | ACKB-01〜02 | 2 | 0 |
| UN | 62 | NSレビューの専用case行なし。RV12／B-03の別管理 | 0 | 62（別gate） |
| SP | 25 | SP01〜25。SP25は通常経路維持 | 25 | 0 |
| OU | 16 | OU01〜16 | 16 | 0 |
| CR | 5 | CR01〜05。CR04は入口境界 | 5 | 0 |
| TH | 6 | TH01〜06 | 6 | 0 |
| 合計 | 228 | 延べ123行から重複4旧caseを除外 | 119 | 109 |

延べ行数は[NS01 draft-0.2](BEST_PRACTICE_RELEASE_AP01_NS01_BINDING_GUARANTEE_REVIEW.md)14、[NS02 draft-0.1](BEST_PRACTICE_RELEASE_AP01_NS02_ACK_RELEASE_GUARANTEE_REVIEW.md)39、[NS03 draft-0.4](BEST_PRACTICE_RELEASE_AP01_NS03_CONSUMPTION_REVOCATION_GUARANTEE_REVIEW.md)18、[NS04 draft-0.1](BEST_PRACTICE_RELEASE_AP01_NS04_SESSION_PROJECTION_GUARANTEE_REVIEW.md)25、[NS05 draft-0.1](BEST_PRACTICE_RELEASE_AP01_NS05_OBSERVATION_COMPARISON_GUARANTEE_REVIEW.md)21、[NS06 draft-0.1](BEST_PRACTICE_RELEASE_AP01_NS06_TIME_HANDOFF_GUARANTEE_REVIEW.md)6。123−4＝119は文書対応数で、移行済み件数・保証回復数・試験成功数・承認数ではない。

### AP01候補と別gateの排他的区分

| 区分 | 正規旧caseの範囲 | 行数／明示対応／専用行なし | 責務先・承認状態 |
|---|---|---|---|
| A1-I01 閉鎖laneの個別残差候補 | SA-01〜24、SAB-01〜11、ND-01〜29、NDB-01〜08、ACK-01〜33・37、ACKB-01〜02、SP01〜24、OU01〜16、CR01〜03・05、TH01〜06 | 158／114／44 | NS01〜06。閉鎖laneの保証低下受容は全件未承認 |
| A1-I02 入口境界 | SA-25・26、ND-30、ACK-34〜36、CR04 | 7／4／3 | AP02／03／05。入口不在化と旧assertionの処遇は別承認 |
| A1-I03 通常経路維持 | SP25 | 1／1／0 | KP01〜03／RV05。非提供・削除候補外 |
| A1-I04 旧ND単体 | UN-01〜62 | 62／0／62 | RV12／B-03。NS非提供を根拠に保証を放棄しない |

158＋7＋1＋62＝228、114＋4＋1＝119、44＋3＋62＝109。区分は[保証回復レビュー](BEST_PRACTICE_RELEASE_GUARANTEE_RECOVERY_SCOPE_REVIEW.md)MP01〜18／RV01〜14の責務分離に沿う本書の審査用索引で、元台帳分類を書き換えない。109全てをAP01未承認の同一理由にまとめず、44の個別照合不足と、3の入口審査不足、62の別gateを分ける。

### 本書の追加個別照合を含む現在値（draft-0.3）

| 区分 | 正規行数 | 6レビュー基準 | 本書の追加対応（旧case重複なし） | 現文書対応／専用行なし |
|---|---|---|---|---|
| 閉鎖lane | 158 | 114 | SA-02〜04・06〜08の6 | 120／38 |
| 入口境界 | 7 | 4 | 0 | 4／3 |
| 通常維持 | 1 | 1 | 0 | 1／0 |
| 別gate UN | 62 | 0 | 0 | 0／62 |
| 合計 | 228 | 119 | 6 | 125／103 |

既存レビュー延べ123＋本書追加6＝129専用行、重複4旧caseを除き125。現在の103は38＋3＋62であり、全てをAP01の同じ未レビュー理由にまとめない。6行を個別照合しただけで、旧試験の実行・新旧同等性・保証低下受容を増やしたとは数えない。

## 3 初稿の未レビュー44行の追跡：個別照合6・残38

次表は初稿の44行とA1-U-IDを保持する追跡索引。A1-U01〜06は追加専用行A1-S01〜06で元test本文を個別照合した。残るA1-U07〜44の38行は正規台帳の**検査主題・残差の引継ぎだけ**で、直接assertion未個別照合のまま。全候補の処遇未選択・保証低下未承認は変わらない。未照合のcode・count・成功／拒否位置を主題から推測補完しない。元revision／fullName／variant・注入位置・直接assertion・診断層を個別票へ記録し、その後に同位置の独立対照か、失う範囲の受容可否を審査する。現在の試験は保持する。

責務先は**実装上のownerとレビュー引継先の役割**で、人名の割当て・実装依頼ではない。担当者・承認者・期限は未割当／未確定。通常の会計・停止・Permit等に関わる共通部分は§5の維持条件が優先する。

| ID／正規旧case | 元台帳上の検査主題・失われ得る検査対象 | 責務先と、個別照合後に必要な回復条件 |
|---|---|---|
| A1-U01／[SA-02](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-02) | 403/no_body。元本文を個別照合済み（文書のみ） | A1-S01へ明示対応。source status consumer→NS01／03。残差・未承認は保持 |
| A1-U02／[SA-03](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-03) | 404/no_body。元本文を個別照合済み（文書のみ） | A1-S02へ明示対応。同owner→NS01／03。403だけで代替しない |
| A1-U03／[SA-04](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-04) | 公開4method非再入。元本文を個別照合済み（文書のみ） | A1-S03へ明示対応。session／source→NS01／03。Dのnetwork非使用だけで代替しない |
| A1-U04／[SA-06](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-06) | 親の不正UTF-8 ff拒否。元本文を個別照合済み（文書のみ） | A1-S04へ明示対応。親取得／source→NS01。同byte列と拒否位置の静的根拠を保持 |
| A1-U05／[SA-07](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-07) | 異なる親sys_id拒否。元本文を個別照合済み（文書のみ） | A1-S05へ明示対応。親projection／source→NS01。必須列を保つforeign入力を維持 |
| A1-U06／[SA-08](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-08) | 親余剰script列拒否。元本文を個別照合済み（文書のみ） | A1-S06へ明示対応。親projection／source→NS01。余剰列拒否と秘密非出力の未assertを分離 |
| A1-U07／[SA-09](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-09) | profileのrelease_status=200拒否 | status入口→NS01、変更時AP03。HTTP到着後の分類と入力拒否を分離 |
| A1-U08／[SA-10](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-10) | profileのrelease_status=401拒否 | 同入口→NS01／AP03。元invalid_input条件をnative HTTP401と同等扱いしない |
| A1-U09／[SA-11](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-11) | cleanup=objectの外部申告拒否 | status入力／cleanup owner→NS01／03。同profileの拒否とtyped終端検査を区別 |
| A1-U10／[SA-12](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-12) | caller session object拒否 | 固定生成入口→NS01／AP03。同名field・同入口で照合 |
| A1-U11／[SA-13](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-13) | fetch=function追加拒否 | 同入口→NS01／AP03。通常の既存fetch注入は維持して閉鎖profileだけを区別 |
| A1-U12／[SA-14](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-14) | delay_ms=10001拒否 | 合成profile境界→NS01／AP03。元上限入力を維持し期限を延ばさない |
| A1-U13／[SA-15](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-15) | 既存fixed-200 transcript guard維持 | fake pin／session→NS01／02。入力status指定とdispatch後非200拒否を分離 |
| A1-U14／[SA-16](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-16) | await前の親bytes copy・caller改変非採用 | 親bytes pin→NS01／02。同内容性を別pin実装の成功だけで代替しない |
| A1-U15／[SA-17](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-17) | status観測delay中取消・timer／admission | 元run停止／status待機→NS01／03。同delay位置と先行理由を保持 |
| A1-U16／[SA-18](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-18) | 事前取消・ready／受理前停止 | constructor／run owner→NS01／03。元factory形状と取得前効果を個別照合 |
| A1-U17／[SA-19](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-19) | 低減responseBytes上限 | canonical会計／status取得→NS01。通常KP01も維持し、native同条件不足を残す |
| A1-U18／[SA-20](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-20) | 低減totalBytes上限 | 同会計→NS01。response capとの別条件を保持 |
| A1-U19／[SA-21](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-21) | request cap4のfinal4枠 | 予約owner→NS01。元登録owner・status経路で枠の維持を照合 |
| A1-U20／[SA-22](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-22) | request cap5のfinal4枠 | 同予約owner→NS01。cap4だけへ統合しない |
| A1-U21／[SA-23](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-23) | 元attempt floor・新期限を作らない | 同run／attempt停止owner→NS03。floorと全run期限の理由写像を分離 |
| A1-U22／[SA-24](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-24) | 低減hard deadline・pending fake I/O取消 | canonical停止owner→NS01／03。元の低減値・実入力を本文で確定し、別期限へ置換しない |
| A1-U23／[ND-03](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-03) | 403/body=trueの一度受理・公開release判断なし | native issuer／consumer／上位診断→NS01／03。旧ND ownerと同reader由来を保持 |
| A1-U24／[ND-04](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-04) | 404/body=trueの正常受理 | 同owner→NS01／03。body403・no_body404・取消404の別対照で代替しない |
| A1-U25／[ND-05](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-05) | 403/body=false・purpose slot／issue | 同owner→NS01／03。旧slot／countの直接assertを本文で確定 |
| A1-U26／[ND-06](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-06) | 404/body=false・purpose slot／issue | 同owner→NS01／03。bodyありと分ける |
| A1-U27／[ND-09](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-09) | native取得前のresponse cap・診断 | canonical会計／native取得／診断→NS01。低減cap・取得前停止と上位slotを同位置へ対応 |
| A1-U28／[ND-10](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-10) | native取得前のtotal cap・診断 | 同owner→NS01。transcriptだけの総量検査で代替しない |
| A1-U29／[ND-11](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-11) | cap4でfinal4枠 | 予約／native上位診断→NS01。同native条件の診断まで照合 |
| A1-U30／[ND-12](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-12) | cap5でfinal4枠 | 同owner→NS01。元cap5を独立variantとして保持 |
| A1-U31／[ND-13](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-13) | 不正親UTF-8・native取得前拒否 | 親decode／native生成owner→NS01。同byte入力・取得前効果を確定 |
| A1-U32／[ND-14](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-14) | parent={}拒否・上位slot | 親projection／native診断→NS01。空objectの同入力と元診断を保持 |
| A1-U33／[ND-15](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-15) | foreignかつ必須列不足の親 | 同owner→NS01。foreignだけの完全行へ変えず複合入力を保持 |
| A1-U34／[ND-17](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-17) | 事前取消・ready／native生成前停止 | constructor／run停止owner→NS01／03。実factory返却・admissionを別root成功で代替しない |
| A1-U35／[ND-20](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-20) | fresh実class run間の同Response再利用拒否 | native identity台帳→NS01。先行履歴と別run拒否を同実registry境界で保持 |
| A1-U36／[ND-21](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-21) | caller session supply拒否 | native固定入口→NS01／AP03。同field・同入口・副作用位置を確定 |
| A1-U37／[ND-22](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-22) | caller consumer supply拒否 | 同入口→NS01／AP03。session供給と別variantで保持 |
| A1-U38／[ND-23](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-23) | caller driver supply拒否 | 同入口→NS01／AP03。Dの固定schemaの存在だけで完了としない |
| A1-U39／[ND-24](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-24) | caller cleanup supply拒否 | native入力／cleanup owner→NS01／03。同caller入口と別profile申告拒否を分離 |
| A1-U40／[ND-25](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-25) | caller binding supply拒否 | native固定入口→NS01／AP03。同fieldでの私有binding非採用を確定 |
| A1-U41／[ND-26](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-26) | caller fetch supply拒否 | 同入口→NS01／AP03。通常fetch注入の維持と混同しない |
| A1-U42／[ND-27](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-27) | 凍結診断copy・live capability非出力 | 診断／construction copy owner→NS01／03。元recursive freeze／handle検査の範囲を確定し、全graph解放へ拡大しない |
| A1-U43／[ND-28](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-28) | native accessorで親bytes copy、shadow getter非実行 | parent byte pin→NS01／02。Uint8Array.byteLength shadowとResponse／stream shadowを別入力として維持 |
| A1-U44／[ND-29](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-29) | proxy／accessor入力・shared親storage拒否、例外非露出 | native入力pin／failure owner→NS01。元parent-storage全variantと診断層を確定 |

### SA-02〜04の追加個別照合（draft-0.2）

元artifactはP（実class＋fake I/O）、基準`ff18189`の[source-status-binding.test.ts](../tests/review/source-status-binding.test.ts)。helperはper-userのPRIVATE_TOKENを持つ固定snapshot、親state=in progress／sys_updated_on=2026-10-31／sys_mod_count=0をJSON bytes化し、既定profileはrelease_status=403・cleanup=cancelledとする。[開発専用probe](../src/review/abort-scope-evidence-source-status-probe.ts)はmodule評価時に既存friendを一度取得し、fresh生成口を呼ぶ。本書はimport・probe実行・friend取得を行っていない。

| ID／正規case・元宣言／variant | 注入位置・直接assertion | 診断層と直接assertしていない範囲 | 責務先・将来回復条件 |
|---|---|---|---|
| A1-S01／[SA-02](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-02)。元宣言はaccepts %i/no_body as a closed-gate source fact, never EOF or release evidence、variant=403 | probe helperのchangeへrelease_status=403・cleanup=no_bodyを渡す正常入力。await返値へのtoMatchObjectはstate=status_accepted_closed_gate、status=403、cleanup_kind=no_body、consumptions=1、release_permit=unavailableの5項目だけ | 成功summaryのstatus事実／cleanupラベル／消費数／Permit非提供が直接対象。run primary・canonical failure・transportConstructor・native HTTP／reader facts・construction診断は直接未assert。timer0・reserved0・accepted_before_close・fallback／issuance／permissions全false・秘密非出力もこのvariantでは直接未assert。別SA-01のassertを借りて足さない | source status consumer／session receipt→NS01／03。元5項目を同実生成・同source消費境界で維持。no_bodyをEOF／JSON ack／ReleaseEvidenceへ昇格させないことは、値表現と私有結合の負対照を別に揃える。二度目／foreign／copy・失効の直接保証は別caseを参照し、この1回成功から補完しない |
| A1-S02／[SA-03](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-03)。同宣言、variant=404 | 同change位置でrelease_status=404・cleanup=no_body。返値の同5項目、statusだけ404 | A1-S01と同じ診断層の限界。HTTP404のResponseやreaderを注入していない。宣言のnever EOFはreader.read=0／cancel=0等をこのcaseが直接計数した意味ではない | 同owner→NS01／03。404/no_bodyの元5項目を独立variantで維持。403成功・bodyあり404・取消404で置換せず、同実source／登録lease／close前受理への連続性は別の結合対照で回復 |
| A1-S03／[SA-04](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-04)。元宣言はdoes not reenter legacy GET, public source reads or the release/permit decision | probe呼出し前にBoundedReadSession.prototype.get、BoundedUpdateSetSource.prototype.readParent／resolveRelease、BoundedReadSession.prototype.bindReviewReleaseSourceの4spyを設置。全て呼ばれたらLEGACY_OR_FALLBACK_FORBIDDENをthrowする。既定profile（403／cancelled）のawait返値consumptions=1と、4spy全てnot.toHaveBeenCalledを直接assert | 返却消費数と指定4methodの非呼出し。global fetch spy・native reader操作・private #observeRelease内部・その他全public method・全診断層／全cleanupは直接対象外。このcaseへSA-01のfetch未呼出しや診断非出力を加算しない。故障は意図的に4methodをthrowへ置換した非再入対照で、取消／期限faultではない | sessionの固定status継続／sourceのprivate status consumer→NS01／03。元4methodと同placement・throw-if-called／呼出し数0、正常消費1を同実classで回復。通常GET／readParent／resolveRelease／正規Permit binding自体を削除するのではなく、この閉鎖probeから迂回しないことを確認 |

共通の静的接続：[session](../src/servicenow/bounded-read.ts)は#runStatusAcceptanceProbeでfresh sessionを生成し、#probeStatusAcceptanceで親ack→同attempt／windowのstatus terminal→consumer.statusへ渡す。takeStatusは自terminalを先に外し、同source／snapshot／lease／core／attempt・ready世代・元floorを確認して消費数を増やす。[source](../src/review/bounded-source.ts)のprivate statusはrelease状態からconsumingへ進み、purpose=release・403/404・cancelled/no_bodyだけをstrict受理する。outer probeはcheck→close→summary返却、finallyでdispose／closeする。これは実装本文の静的順序で、SA-02〜04がこれら全内部field・全post・回収を直接assertしたものではない。

SA-02／03のno_bodyはfake profileが返す申告値で、native Responseから取得した終端証拠ではない。現在の3行の本文照合では、実native cleanup・実認証・実通信・正式provenanceを確認していない。正常summaryで診断fieldをassertしないことと、診断が保持されない／不要という判断も区別する。失敗時の各ownerの診断保持・未確認cleanup責務はNS01／03の既存条件へ残す。

#### 候補・compiledとの差分と回復の記録

| 比較先 | 直接読める保証 | 元SA-02〜04に残る差分 |
|---|---|---|
| [DN-02／03](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dn-02)／[development-native.test.ts](../tests/review/development-native.test.ts) | createDevelopmentRootへResponse(null,{status:403/404})を注入。ok、HTTP status／body_present=false、cleanup confirmed/no_body、get_reader／read／cancel／closed／release_lock全0、source status_consumptions=1／release_consumptions=0、bootstrap.release_match=not_evaluatedをassert | 元Pはfake申告no_bodyで、Dはnative cleanup経由・独立source／brand／台帳。Dに操作0という別の強いassertがあっても、元status_accepted_closed_gateの5項目・同実session／登録lease・source私有消費／外側closeを代替しない。親値・principalも元helperと異なる |
| [DB-17](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-db-17)／[development-bootstrap.test.ts](../tests/review/development-bootstrap.test.ts)、[DN-21](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dn-21) | 別D runの成功と、既存実session2個のconstruction／budget／primary不変、third sessionのreview_busy、global fetch未呼出しをassert | 同process非干渉・network非使用は関連するが、元SA-04の実prototype4spyを設置した対照ではない。Dは親state=complete等・別brandのsourceで、元status消費経路からの4method非再入は未代替 |
| [compiled SA fixture](../tests/review/fixtures/compiled-source-status-binding.mjs) | 403／cancelledの基本受理・消費1／close前受理・closed／予約／権限なし・fetch0、404／unconfirmed拒否等を記述 | SA-02／03の403/404 no_body variantと、SA-04の4prototype spyはこのfixtureにない。fixture名のSA-02は開発工程名で、旧case SA-02の全assertionを実行する意味ではない。今回dist import／実行・build／packはしない |

3行とも既存分類は部分対応、処遇未選択・保証低下未承認。個別票A1-P01〜06の元case・入力／spy位置・直接assertion・診断未assert・責務先・回復条件を本節で具体化したが、担当者・期限とA1-P07〜10の選択／承認は未記入。回復記録は元Pと新artifact、同入力・同注入位置・期待値、独立正負対照・compiled・終了／cleanup結果を別承認後に揃える。原assertion外のreader操作0・private slot全検査等を追加するなら追加受入条件として明記し、旧実績や失われる保証へ遡及加算しない。通常K01〜05と既存fetch／GET／source／Permitを維持し、新friend・公開supplier・fixture台帳共有で穴を埋めない。

### SA-06〜08の追加個別照合（draft-0.3）

元artifactは同じP（実class＋fake I/O）、基準`2f8d3f0`の[source-status-binding.test.ts](../tests/review/source-status-binding.test.ts)。元宣言は3variant共通の`rejects malformed/foreign parent data before status acceptance`で、宣言にindex置換はない。正規台帳のvariantで識別し、実行fullNameを推測生成しない。前節のhelperのchangeへparent_bytesだけを置換し、既定403／cancelled・target=a×32・per-user snapshotを保つ。throw／取消／時計faultの注入ではない。

| ID／正規旧case・入力variant | 注入位置と直接assertion | 診断層・未assert範囲 | 責務先・将来回復条件 |
|---|---|---|---|
| A1-S04／[SA-06](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-06)。new Uint8Array([0xff]) | probe changeのparent_bytesへ単一byte ffを渡す。await expect(probe(...)).rejects.toMatchObject({code:invalid_response})、続く別freshの既定probe返値cleanup=closedの2点 | callerの拒否codeと後続fresh成功だけ。run primary・canonical failure・transport／native facts・construction診断・失敗runのcleanup完了／timer0／枠返却は直接未assert。ffをc3 28や有効UTF-8の不正JSONへ置換しない | 親decode／session停止・外側close owner→NS01／03。同byte・同実生成境界で拒否とfresh成功を回復。status取得前という位置は下記静的順序と区別し、取得数0等を実測するなら追加対照とする |
| A1-S05／[SA-07](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-07)。encode({result:{...parent,sys_id:b×32}}) | 完全な既定5列の親からsys_idだけ変更。targetはa×32のまま。同じinvalid_response拒否と別freshのcleanup=closedをassert | A1-S04と同じ診断層の限界。foreignかつ必須列不足の別ND入力ではない。同実source／登録leaseの私有同一性全検査・status消費0・課金量は直接未assert | 親projection／同sourceのprivate parent consumer→NS01。元5列とforeign targetの条件を保ち、同実sessionからのack消費位置を回復。独立Dのtarget検査だけで登録ready世代・元closeの保証を代替しない |
| A1-S06／[SA-08](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-08)。encode({result:{...parent,script:PRIVATE}}) | 正常親の全5列にscript列を追加。同じinvalid_response拒否と別freshのcleanup=closedをassert | A1-S04と同じ診断層の限界。PRIVATEという入力だけで例外／summaryの秘密非出力をassertした扱いにしない。公開4method spy非再入もこのvariantにはない | strict親値／source・failure owner→NS01。同余剰列を黙ってdropせず拒否する境界を回復。非露出・元失敗runの解放／診断保持を追加検証する場合は、旧2assertionと別条件として明記 |

#### 拒否位置の静的根拠と、確認していない失敗責務

[sessionの#probeStatusAcceptance](../src/servicenow/bounded-read.ts)はreserve／markReady→親dispatch→fake.parent→同bytes長のchunk計上／response cap→fatal UTF-8 decode／JSON.parse→parent ack→consumer.parent→guardの順。その後に初めてstatus window・次のdispatch・fake.observe・status terminal／consumer.statusへ進む。ffはdecode／parseのcatchからinvalid_responseとなる。foreign／余剰列は[sourceのprivate parent consumer](../src/review/bounded-source.ts)から[共有値kernelのparseSourceParent](../src/servicenow/review-kernel/source-values.ts)へ入り、strict5列とtarget一致の検査でSourceValueError（invalid_response）となり、BoundedReadErrorへ写像される。共有なのはこの値境界で、UTF-8解析・実生成／ack／登録owner／停止／closeを全て共通化した意味ではない。

この順序は「status受理前」の静的根拠であり、元3variantが第二dispatch=0・consumer.status=0・C/G/P値を直接計測した証拠ではない。失敗tailはsession.stop、consumer.revoke／予約release、外側finallyのfake.dispose／session.closeを記述するが、その全post成功・未確認cleanupなしを元caseのassertionへ加算しない。後続のprobe()は新しいrunであり、先行runのcleanup='closed'をinspectしていない。先行runの失敗診断と未確認責務は元停止／close ownerへ保持し、fresh成功でUnknownを消さない。

#### 独立D候補・compiledとの対応と残差

| 比較先 | 同じ入力族と直接assertion | 元Pとの差・回復条件 |
|---|---|---|
| [DB-29](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-db-29) | [development-bootstrap.test.ts](../tests/review/development-bootstrap.test.ts)のcharges and refuses malformed or foreign parent bytes %#のindex0。単一ffをparent transcriptへ置換 | PのSA-06と同byte。Dは独立rootのsummaryを返し、Pはcaller Promiseをrejectする。UTF-8解析は別実装で、同実sourceへの継続・元失敗tailの診断を代替しない |
| [DB-30](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-db-30) | 同宣言index1。全5列からsys_idだけb×32へ置換、target=a×32 | PとDは親のstate／日付／mod_countが異なる。Dはcomplete／2026-11-01／1、Pはin progress／2026-10-31／0。共有parseSourceParentのtarget拒否は関連するが、別source／brand／台帳で元session結合を代替しない |
| [DB-31](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-db-31) | 同宣言index2。全5列へscript:PRIVATEを追加 | 共有strict値検査は関連するが、Pのfake status profileとDの固定200 transcriptは別経路。Dの秘密非出力assertをPの既存保証へ加算しない |

Dの3variantは全てok=false／code=invalid_response、budget.requests=1／received_bytes=入力長、source.parent_consumptions=0、bootstrap.release_attempts=1／reserved=0、JSON.stringify(result)にPRIVATEを含まないことを直接assertする。release_attempts=1をrelease GET／第二dispatchが行われたという計数へ読み替えない。Dのprincipal=parent・per-user transcriptはparent＋Australiaのrelease200を備え、[開発source](../tests/support/review/ef03/source.ts)のissueから同値kernelへ入る一方、実session／sourceは採用しない。会計／非露出等の強い別assertionがあっても元Pの拒否形状・fresh回復と同ownerへの連続性は未代替で、新native同入力の網羅とも扱わない。

[既存compiled SA fixture](../tests/review/fixtures/compiled-source-status-binding.mjs)は正常親の403／cancelled受理と404／unconfirmed拒否等を記述し、このff／foreign／余剰scriptの3variantは収録していない。今回compiledの実行実績は追加しない。3行とも正規分類は部分対応、A1-P07の処遇未選択・P09未承認。元入力・拒否code・別fresh成功の回復と、失敗run診断・cleanup／native取得前操作数等の追加対照を分け、同元位置・正負対照・compiled artifactと終了確認を別承認後に揃える。旧試験・通常K01〜05を維持し、新friend・公開supplierを回復口にしない。

### 未個別照合の入口3行と別gate62行

| ID／対象 | 未レビューの検査主題・責務先 | 扱い |
|---|---|---|
| A1-X01／[SA-25](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-25) | 既存sessionへ推測keyでconsumerを付けない。source生成→AP02／03 | 元assertionの処遇は未個別照合。撤去後の不在検査と現入口拒否を別実績にする |
| A1-X02／[SA-26](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-26) | probeのruntime class非露出・friendの一度take。公開境界→AP02／05 | 保証低下・撤去・旧case削除は未承認 |
| A1-X03／[ND-30](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-30) | native friendの一度take・runtime非露出。公開境界→AP02／05 | 新入口なし／閉包不在への意図的仕様変更を個別審査 |
| A1-X04／[UN-01〜62](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-un-01) | 旧ND単体のissuer／consumer・同reader・cleanup・時計／再入・provenance／seal。RV12／[B-03](BEST_PRACTICE_RELEASE_B03_COMPILED_MIGRATION_FAULT_DESIGN.md) | NSレビューの専用case行なしという意味で、既存B-03のmatrixや限定値kernel検証がないという意味ではない。62行をAP01の保証免除へ含めない |

入口7行の残り[ACK-34〜36](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ack-34)はNS02、[CR04](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#cr04)はNS05に専用行があるが、撤去済み／不在検査済み／承認済みではない。旧ND単体のLM03・専用artifact、通常経路のKEEP／US／EK／ET・FRは、それぞれの元台帳へ責務を残す。

## 4 重複4旧case：一つの承認単位・二つの条件参照

| ID／正規旧case | NS01の専用行 | NS03の専用行 | 失われ得るassertionと条件の保持 |
|---|---|---|---|
| A1-D01／[SAB-03](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sab-03) | N1AD03 | N3-C01 | 二度目consumer拒否・内部invalid_state／外部internal_review_error、未公開のまま停止。両行の将来回復条件を同元位置で参照 |
| A1-D02／[NDB-03](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ndb-03) | N1AD04 | N3-C02 | source二度目とnative最終消費を別計数。native consumed=0／draft=null等の直接assertを残し、claim一律0へ補正しない |
| A1-D03／[SAB-06](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sab-06) | N1AD05 | N3-C11 | close後consumer拒否・Permit／port回復不可・返却非権限性。通常Permitの正規経路は維持 |
| A1-D04／[NDB-07](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-ndb-07) | N1AD06 | N3-C12 | 実consumerのclose後拒否・live handle／秘密非出力。診断booleanで全graph退役を証明しない |

両側の条件本文は[NS01 §4](BEST_PRACTICE_RELEASE_AP01_NS01_BINDING_GUARANTEE_REVIEW.md)と[NS03 §3](BEST_PRACTICE_RELEASE_AP01_NS03_CONSUMPTION_REVOCATION_GUARANTEE_REVIEW.md)を正規参照とする。この4行へforeign履歴不変や同登録世代・取消・元floorを混入しない。それらはそれぞれN1RG03〜06、N3-C03〜C07・C09・C10、N3-C08の別条件。片方を変えたらもう片方も照合し、片方だけ満たして重複case全体を完了にしない。

NS05の空O保持とNS06の上位移譲、NS02のackとNS04のprojectionは依存するが同じ旧caseではない。共有する値・停止理由があることと、case重複を区別する。

## 5 通常経路の維持台帳：保証低下受容の候補外

以下はAP01親文書KP01〜05の維持条件を責務先へ対応付ける。試験の存在・過去成功は今回の再検証ではない。閉鎖laneと共有する生成・会計・closeを一括撤去しない。

| ID／親KP | 維持する保証・正規根拠 | 実装上owner／レビュー責務 | 停止条件 |
|---|---|---|---|
| A1-K01／KP01 | 認証snapshotからのmode、元startedAt／既存deadlineMs getterの全L、provider pin、単一canonical会計・final4予約・retry・admission／停止。[通常会計試験](../tests/review/canonical-session-migration.test.ts) | client／session／budget・run owner。NS01／02／04とRV04 | 第二予算／起点・remainingからL再計算・provider再pin・先行理由の上書きが必要なら受容票で救済せず分離を再設計 |
| A1-K02／KP02 | 通常sourceの同session／ReleasePermit・不変release snapshot、foreign／copy／再利用・close後拒否。[source binding試験](../tests/review/source-release-binding.test.ts) | source／登録owner。NS02とRV03 | 閉鎖status非提供を理由に既存Permitを撤去・再定義しない |
| A1-K03／KP03 | legacy release判断・既存C方式のbinding／寿命／失敗条件、通常[SP25](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#sp25)のgetter未使用契約。[C方式試験](../tests/review/operator-release-fallback.test.ts) | 通常source／release config。NS02／04とRV05 | fixed fakeの200限定guardを通常HTTP全体へ広げず、新status fallbackも有効化しない |
| A1-K04／KP04 | 通常source→worker→0.2／0.3等の出力・取消／終了待ち・本文非露出。[adapter試験](../tests/review/update-set-adapter.test.ts) | adapter／worker supervisor／finalize・schema。NS05／06とRV05 | 未接続の新job／O／U契約で通常worker・既存soft／部分finishを弱めない |
| A1-K05／KP05 | factoryの最初のshell・部分rollback・first reason・run／construction診断分離、省略compositionのC=0／予約返却／close | constructor／construction owner・省略時composition。RV01／02、元KEEP／ET等 | fake branchと共通する#openComposition・失敗copy・回収を消す必要があれば実装へ進まない。元fetch注入・省略時固定拒否を維持 |

維持根拠のsource参照と限定範囲は[保証回復レビューEV01〜05／RV01〜05](BEST_PRACTICE_RELEASE_GUARANTEE_RECOVERY_SCOPE_REVIEW.md)を継承する。SP25は明示対応119の1行に含むが、非提供保証の低下やDへの移行を承認する行ではない。維持条件への影響が不明ならUnknownとして候補リリースを止め、閉鎖laneの非提供で帳消しにしない。

## 6 明示対応済みcaseの残差・失われ得るassertionと責務先

以下は専用case行への審査入口であり、6行を一括で受容する表ではない。6レビューの専用case行を本台帳の明細参照とし、原文を再copyして条件を二重管理しない。各旧case／assertionは当該行の元assertion列と将来条件を参照して個別票へ結合する。全行「旧試験維持／処遇未選択／保証低下未承認」。本書追加のSA-02〜04・06〜08はA1-S01〜06を参照し、残未レビュー38行は§3で個別照合する。

| ID／NS・case参照 | 旧直接assertと連続保証の残差（区別して審査） | 責務先・将来回復条件 | 通常維持との境界 |
|---|---|---|---|
| A1-R01／NS01：N1RG01〜06・N1AD01〜08 | 同constructor／core／source・実登録ready世代、偽markReady成功の拒否、foreign履歴不変、同実consumer・構築失敗copy。Dの別brand／世代1や診断booleanだけでは代替不可。SAB-08のrejectとNDB-08のrequests／native操作0は強さが異なる | 正規生成／登録owner→status／native consumer、construction copyの責務。元private生成・同参照／元fault位置で正負対照と診断を回復。未生成prefixと生成後失敗を区別 | K01／02／05を維持。新friend・成功申告APIを回復口にしない |
| A1-R02／NS02：N2-A01〜18・R01〜11・X01〜10 | 同snapshot由来mode→課金した同body→typed終端／private ack→実source／legacy判断／Permit／preparedの連続性。G合計一致や純粋matchedは同内容性・実bindingを証明しない。入力status拒否とdispatch後403拒否も別 | 同canonical accounting／attempt／source ack・release port／登録owner。caller改変・foreign／copy・重複・用途混入・bind偽装、認証variant・HTTP元位置と先行理由を回復 | K01〜03／05を維持。ACK-34〜36の入口処遇はAP02／03も必要。実認証・実通信provenanceは旧fakeでも未保証 |
| A1-R03／NS03：N3-C01〜12・D01〜06 | 一度消費・draft後失効、consumer復帰後の同期／queue取消、元floor、closeまでの非公開、HTTP／cleanup／run／constructionの分離。元freeze spyは特定site完了後を識別せず、queue予約も非同期return後の特定位置を証明しない | native issuer→唯一consumer→上位診断→外側close・cleanup owner。直接assertされた位置を回復し、gap専用post・site識別は追加条件として分ける。reader未確認をconstruction confirmedで上書きしない | K01／02／04／05の取消・解放は延期しない。§4の4重複caseは両レビュー参照を保持 |
| A1-R04／NS04：SP01〜24（N4-S01〜24） | 同sessionのS／全L／元policy参照、getter一度、getter副作用後／pending消費時の実field照合・取消／close後拒否。Dのcontext値検査では実field改変・provider位置を代替不可 | session projection／元origin・停止owner／release config。残時間／caller options・同値policy copy・別sessionを区別し、元expiry等号とlimitationsを回復 | K01／03を維持しSP25を除外。設定validity不足時の実測継続を一律停止へ変えない。全claim故障は旧SPの直接assert外もある |
| A1-R05／NS05：OU01〜16・CR01〜05 | 元classの直接assertはISO総数・公開Oの有無／実測値・旧caller拒否／prepared会計・改変／入力拒否等。内部空O保持・receipt一度消費／失敗後再採取拒否の直接対照は別の値owner試験にもあり、実classがprivate状態を直接inspectした実績へ合算しない。事前O入力では採取位置を代替不可 | 同source／projection／ackの観測・receipt owner。clock throw／逆行・O前／中取消・同bytes copy、一度消費／破棄の値保証と元class接続を分けて回復。未知・不完全・21行の旧caller拒否とD unknown公開は非同等 | K03／04を維持。通常sourceの空200採取を差し替えず、CR04入口はAP02／03へ。新公開UTC／clock supplierは作らない |
| A1-R06／NS06：TH01〜06（N6-T01〜06） | THの直接assertは旧prepared／会計・時計／fetch／秘密非出力、選択3点sync／queued・全正常経路同期sweepのcancelled／timer0・fresh成功等。同accepted→held→sourceClosed→discardの私有値保持は値bridge対照と静的接続を分け、THの直接inspect保証にしない。D withheldも元caller rejectの代替ではない | donor／time scope／元run停止・外側終端owner。元位置・実発火・最終discard失敗の負対照・最初の診断を回復。source正常解放とrun失効を分離 | K04／05を維持。finally全section継続とrollback救済の識別は旧試験でも未確認。worker job／T_i／U／Eへの正式接続は元THでも未完 |

具体的な旧assertion本文・入力variant・元artifactと、残差の回復条件は§2に列記した6レビューを正規参照とする。略記したN2のR／X、N3のDも同じレビュー内のIDで、別caseの条件を取り込まない。現時点の失敗診断・費目・全解放について、旧caseが直接assertしていない欄は未assert／追加対照必要と記録する。

### 旧保証の喪失と混同しない追加条件・別gate

| ID | 現在の不足／未接続 | 責務先・固定する扱い |
|---|---|---|
| A1-F01 | NS03のfreeze site識別・非同期return→外側close位置証拠 | NS03のN3-B05〜08／C07〜10。旧注入を維持し追加対照として設計。旧caseが全gapを保証したと遡及変更しない |
| A1-F02 | NS06のfinally後続sectionがrollback救済で外から区別不能 | NS06／[TB-B記録§6](E2E_BEST_PRACTICE_RELEASE_TIME_HANDOFF_TBB_2026-11-01.md)。timer0・fresh成功を全section実行の証拠にしない。未確認として責務保持 |
| A1-F03 | 実source／window／payload receipt／worker job、O→T_i／保持U→E、実worker終了・実cleanupの連続binding | NS06のN6-W01〜05／[worker時刻設計](BEST_PRACTICE_ABORT_SCOPE_WORKER_TIME_BINDING_DESIGN.md)。合成issuer値保証を実供給元へ昇格しない。prepared-onlyの固定discardを削除しない |
| A1-F04 | 専用artifact・元fault位置のcompiled、P／D／U非干渉、実tarballの通常依存正対照／禁止閉包負対照、旧UN62 | RV12／14・B-03。既存正常fixture成功／import不能だけで保証回復・不在成功としない |
| A1-F05 | 通常並列3件timeout・最終候補検証、元Lと宣言deadlineの差・日時長cap・全費目／backing容量 | 最終品質／AP06と各owner。元期限・並列度、未承認選択とUnknownを保持し、AP01で解消した扱いにしない |

## 7 個別票の固定項目・現在値

個別票は文書dataであり、runtime証拠・claim・発行口ではない。A1-R／Uの要約から自動で「受容」を選択しない。NS専用行119＋本書追加6の計125旧caseにも、まだ人の個別承認はない。

| ID／欄 | 必須内容 | 現在値・未記入時の扱い |
|---|---|---|
| A1-P01 識別 | 正規旧ID・元revision／宣言テンプレート／入力variant、対象lane・artifact、assertion列の参照 | IDは§2〜4／6へ結合。実行fullName・fault位置を推測生成しない |
| A1-P02 維持境界 | 該当K01〜05と共通source／owner・影響しない根拠 | 維持必須。影響不明はUnknownで審査保留 |
| A1-P03 保証／喪失 | 旧testが直接assertするcode／count／shape／診断・故障位置、何を失い何は残るか | 明示対応caseは元レビュー列／追加専用行を参照。残未レビュー38＋入口3は本文個別照合待ち。喪失は将来変更時の可能性で現在の退行判定ではない |
| A1-P04 代替と残差 | 新case・共有部分・異なる入力／時点／owner・未代替assertion | 旧分類を維持。Dの成功数・似たcodeで同等としない |
| A1-P05 所有／失敗 | 実装上owner、停止・未公開値・未確認cleanup／custody・診断の保持先 | §3／5／6の役割へ引継ぎ。人の担当者は未割当。全解放・実容量は未確認ならUnknown |
| A1-P06 回復 | 同入力・同元位置・正負対照・元期限・source／compiled artifact・終了確認と再レビュー条件 | 将来条件だけ記載。未実施を成功へ変えない。新friend・台帳共有を回復口にしない |
| A1-P07 処遇案 | 維持／回復先行／保証低下受容を審査する案／受容不可・リリース停止のいずれかと根拠 | **全候補未選択**。通常K条件は維持必須。未レビューや維持影響不明を受容可能へ補完しない |
| A1-P08 受容条件 | 非提供の外部説明、許容しない影響、残差責務先、将来再開・回復判定条件 | 未承認。日付だけで自動解除・将来提供開始しない |
| A1-P09 承認記録 | 個別の承認者・承認日・決定・対象revision／assertionと除外条件 | **未承認／未記入**。担当者・期限も未確定。AIの推奨・文書作成・コミットは承認にしない |
| A1-P10 他AP | AP02撤去／AP03互換／AP04結果差／AP05旧試験・artifact／AP06公開への影響 | 全て別承認。AP01が将来承認されても自動開始しない |

本書で決めたのは記録形式・未レビュー索引・引継ぎ役割だけであり、A1-P07の選択やP09の承認ではない。現在は旧試験・friend・sourceを保持する。ただしfriendを残した現配布境界を公開可能とする例外は作らない。

## 8 優先順と停止条件

1. §2の排他的区分と§5のK条件を先に確認し、非提供と通常維持を混ぜない。旧case・variant・artifactを固定して重複4行の両参照を保つ。
2. §3の初稿44行のうちSA-02〜04・06〜08を個別照合した文書記録として保持し、残38行を個別に照合する。次はSA-09〜14のprofile／外部供給拒否から、入力境界とHTTP到着後の判定を分けて確認する。取消・元floor／予算・診断、native／bytes・再利用境界も元variantで照合する。入口3行はAP02／03の別票へ渡す。未レビューが残る行は未承認・審査保留のままとし、群全体の受容で覆わない。
3. 明示対応済みの各旧caseもA1-P01〜10へ結合し、通常維持への影響・失われ得る直接assert・残差所有と回復条件を確定する。追加条件F01〜05と別gateを、失う旧保証へ混入しない。
4. 個別受容の可否はユーザーの別承認へ渡す。受容できなければ回復先行または候補リリース停止。旧試験削除・friend撤去・設定変更・実装・公開はここから開始しない。

AP01の判断材料が揃っても、保証回復・配布閉包撤去・最終品質・公開を完了とはしない。各閉鎖条件・Unknown・調査保留を維持する。

## 9 今回の静的確認

以下は初稿draft-0.1時の記録。追加個別照合の現在値・確認範囲は§2の追加表・§3のA1-S01〜06と末尾のdraft-0.3記録を参照する。draft-0.1／0.2の件数は各時点の履歴として保持する。

正規228行のanchorと、6レビューの専用case行の最初の正規旧caseリンクを照合した。本文参照・D候補リンク・同名だが別入力の行を重複として数えず、旧case IDをanchorから確定した。未レビュー表は旧台帳の主題と残差の索引で、44行の直接assertionレビュー完了ではない。実装・製品module import／実行・試験再実行・build／pack・発行・保証回復判定は行っていない。

初回の補助集計では、行内の最初のlink labelを旧IDへ使ったためSP等の候補DB名を拾い、さらにanchor表示変換にも不整合があった。旧IDは正規anchorから直接確定し、固定した11群それぞれのID形式・母数／明示対応数／未対応索引数を照合する方式に訂正した。これは文書集計の訂正で、製品の不具合・試験失敗・元caseの分類変更ではない。

2026-11-19の静的確認：本書とAP01親文書の2MDについて表13・ローカルlink95・明示anchor61、A1設計ID82（I4／U44／X4／D4／K5／R6／F5／P10）、正規228行・専用行延べ123／重複除外119・重複4旧caseと両レビューIDを確認した。閉鎖lane158（明示114／専用行なし44）、入口7（4／3）、通常維持1（1／0）、別gate62（0／62）の排他的区分と総数が一致した。U44行・入口未レビュー3行は正規台帳からの差集合と重複／欠落0、K5群・NS6群・処遇未選択とAP01〜06未承認欄を維持した。末尾改行・表列数・差分空白を確認し、tracked差分はAP01親MD1件、新規は本書1MD、stage0、製品・試験・設定の変更0だった。保証低下受容・撤去・公開可の証拠は追加しない。

### draft-0.2：SA-02〜04の個別本文照合（2026-11-19）

基準`ff18189`の元test全文、probeのprofile pin／friend経由fresh生成、sessionのstatus消費・outer close、sourceのstrict status受理と、DN-02／03・DB-17／DN-21の該当本文、compiled SA fixtureを静的に読んだ。元2宣言／3variantをA1-S01〜03へ対応付け、no_body正常入力と4method置換の注入位置・直接assertion・診断未assert範囲・別候補との差を区別した。3行とも部分対応・未承認のままで、元caseの全EOF／reader／全診断・全cleanup保証へ補完しない。runtime fullNameの実行再発見、製品module import／friend取得、試験再実行・build／packはしていない。

2MDの表16・ローカルlink108・明示anchor67、A1設計ID85（従来82＋S3）、正規228／6レビュー延べ123・重複除外119／重複4を再確認。本書追加SA-02〜04の3行が既存119と重ならず、現文書対応122、閉鎖lane117／未レビュー41、全区分の専用行なし106（41＋入口3＋別gate62）と一致した。元5field期待・4spyの設置／throw／未呼出し・消費1、DのResponse(null)／操作0と非干渉、compiledのno_body／4spy非収録を静的照合した。未承認欄・通常K条件・末尾改行・表列数・差分空白を確認し、変更はtrackedのMD2件だけ、stage0、製品・試験・設定変更0。実行成功・同等移行・保証低下受容・撤去・公開可の実績は追加しない。

### draft-0.3：SA-06〜08の個別本文照合（2026-11-19）

基準`2f8d3f0`の元宣言／helper・3入力と直接2assertion、sessionの親decode→private parent受理→status取得の静的順序、sourceと共有strict親値kernel、DB-29〜31の入力／summary期待値と開発source、既存compiled SA fixtureを照合した。拒否位置の静的根拠・元callerの拒否・別fresh成功・Dの独立会計検査を分離し、先行失敗runの診断／cleanup成功を推測補完しない。

補助の静的確認器の初回実行では、本文の「旧2assertion」を検索する箇所を「元2assertion」と誤指定して1件失敗した。本文との不一致を確認して確認器の検索語だけ訂正し、再実行で一致した。製品・元試験の失敗ではなく、本文の保証条件も弱めていない。

2MDの表18・ローカルlink121・明示anchor73、A1設計ID88（従来82＋S6）、正規228／6レビュー延べ123・重複除外119／重複4を確認。追加6旧caseは既存119と重複せず全て部分対応、現文書対応125、閉鎖lane120／未レビュー38、全区分の専用行なし103（38＋入口3＋別gate62）と一致した。初稿U44の索引・重複4旧caseの両参照、通常K5群・AP01〜06未承認・処遇未選択を保持。元3variantの同入力・2assertion、Dの別assertionと既存compiledの当該3variant非収録、ローカル参照・表列数・末尾改行・差分空白を静的確認した。変更はtrackedのMD2件だけ、stage0、製品・試験・設定変更0。製品module import／friend取得・試験再実行・build／pack・発行・コミット・Pushはせず、保証回復・実行同等性・個別承認・公開可の実績は追加しない。
