# AP01：個別承認用の残差台帳・未レビュー／重複と通常経路の維持条件

Version: release-ap01-individual-approval-residual-ledger-draft-0.14 / Date: 2026-11-19。
Status: **個別承認の材料。公開方針だけ採用済みで、保証低下の受容は全件未承認・処遇未選択。** 基準HEADは`5dec892`。[AP01親文書](BEST_PRACTICE_RELEASE_AP01_LIMITED_SCOPE_DESIGN.md)の①審査対象／範囲、②通常経路の維持、③失われ得るassertionと回復責務を一体で整理する。文書完成・明示対応・旧試験の存在を、保証回復や承認可能との判定にしない。

draft-0.13のレビュー修正：レビュー修正の基準HEADは`923a69f`（修正時のHEADは`923a69f`）。draft-0.12の個別本文照合記録の文末を他の記録と同じ実施済みの否定形「行っていない」へ揃え、静的確認の用語「anchor参照」を従来の「明示anchor」へ統一した。値（表28・ローカル参照247・明示anchor151）、照合内容・件数・旧分類・処遇未選択・承認状態は変更しない。

draft-0.11のレビュー修正：レビュー修正の基準HEADは`8801437`（修正時のHEADは`8801437`）。ND-21〜26節の行番号付きリンク3件（元P試験・旧native wrapper・DN-14の元試験）を、本書の他の参照と同じファイル単位のリンクへ戻した。行番号はコード編集でずれ、旧wrapperへのリンクは入口検査ではなくmodule評価時のfriend取得行に着地していたため、検査を行う関数は本文で`probeNativeStatusComposition`と名指しする。draft-0.10の静的確認記録へ、提出時の表27・ローカル参照235・明示anchor146と差分空白の確認を補い、文末を他の記録と同じ実施済みの否定形へ揃えた。修正後の2MDは表27・ローカル参照235・明示anchor143。照合内容・件数・旧分類・処遇未選択・承認状態は変更しない。

draft-0.2の個別照合基準は`ff18189`。初稿の44行索引からSA-02〜04を本書の追加専用行A1-S01〜03へ対応付け、その時点の文書対応122・閉鎖laneの残未レビュー41を記録した。draft-0.3は`2f8d3f0`を基準にSA-06〜08をA1-S04〜06へ追加。6レビューの明示119旧caseという基準値は書き換えず、本書追加6を含む文書対応125・閉鎖laneの残未レビュー38を記録した。draft-0.4は`6c6123e`を基準にSA-09〜14をA1-S07〜12へ追加。6レビューの明示119旧caseという基準値は書き換えず、本書追加12を含む文書対応131・閉鎖laneの残未レビュー32を記録した。draft-0.5は`8e8dbdf`を基準にSA-15〜24をA1-S13〜22へ追加。6レビューの明示119旧caseという基準値は書き換えず、本書追加22を含む当時の文書対応141・閉鎖laneの残未レビュー22を別集計する。追加22行の旧case分類は部分対応18（SA-02〜04・06〜08・11・12・15〜24）／未対応4（SA-09・10・13・14）のままで、保証回復・実行同等性・個別承認は追加しない。

draft-0.6は`efb740b`を基準にND-03〜06をA1-S23〜26へ追加した。当時は本書追加26（部分対応22／未対応4）、文書対応145、閉鎖lane未レビュー18。6レビュー基準・旧分類・承認状態は不変。

draft-0.7は同基準のND-09〜12をA1-S27〜30へ追加した。当時は本書追加30（部分対応26／未対応4）、文書対応149、閉鎖lane未レビュー14。入口3・別gate UN62と区別し、旧分類・処遇・承認状態は変更しない。

draft-0.8は同基準のND-13〜15をA1-S31〜33へ追加した。当時は本書追加33（部分対応29／未対応4）、文書対応152、閉鎖lane未レビュー11。入口3・別gate UN62と区別し、旧分類・処遇・承認状態は変更しない。

draft-0.9は同基準のND-17／20をA1-S34〜35へ追加した。当時は本書追加35（部分対応31／未対応4）、文書対応154、閉鎖lane未レビュー9。入口3・別gate UN62と区別し、旧分類・処遇・承認状態は変更しない。

draft-0.10は`cafe86e`を基準にND-21〜26をA1-S36〜41へ追加した。当時は本書追加41（部分対応32／未対応9）、文書対応160、閉鎖lane未レビュー3。入口3・別gate UN62と区別し、旧分類・処遇・承認状態は変更しない。

draft-0.12は`47e5f3b`を基準にND-27〜29をA1-S42〜44へ追加した。当時は本書追加44（部分対応34／未対応10）、文書対応163、閉鎖lane未レビュー0。当時は入口3と別gate UN62が残り、旧分類・処遇・承認状態は変更しない。

draft-0.14は`c1f562b`を基準に入口境界のSA-25／26・ND-30をA1-X01〜03で個別照合した。本書追加は閉鎖lane 44（部分対応34／未対応10）と入口3（すべて未対応）の計47、現文書対応166。閉鎖lane158と入口7の専用行なしは各0、別gate UN62は従来どおり。入口3件の現行テストと将来の不在確認は非同等で、処遇未選択・承認状態は変更しない。

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

### 本書の追加個別照合を含む現在値（draft-0.14）

| 区分 | 正規行数 | 6レビュー基準 | 本書の追加対応（旧case重複なし） | 現文書対応／専用行なし |
|---|---|---|---|---|
| 閉鎖lane | 158 | 114 | SA-02〜04・06〜24／ND-03〜06・09〜15・17・20〜29の44 | 158／0 |
| 入口境界 | 7 | 4 | SA-25・26／ND-30の3 | 7／0 |
| 通常維持 | 1 | 1 | 0 | 1／0 |
| 別gate UN | 62 | 0 | 0 | 0／62 |
| 合計 | 228 | 119 | 47 | 166／62 |

既存レビュー延べ123＋本書追加47＝170専用行、重複4旧caseを除き166。専用行なし62は全て別gate UN。閉鎖laneと入口境界の文書照合が揃っても、移行・保証回復・実行同等性・保証低下受容は完了しない。

## 3 初稿の未レビュー44行の追跡：個別照合44・残0

次表は初稿の44行とA1-U-IDを保持する追跡索引。A1-U01〜44は追加専用行A1-S01〜44で元test本文を個別照合した。閉鎖lane158行の文書対応に欠落はないが、全候補の処遇未選択・保証低下未承認は変わらない。入口の追加照合3行と別gate UN62は別表に保持する。個別票には元revision／fullName／variant・注入位置・直接assertion・診断層を結合し、同位置の独立対照か、失う範囲の受容可否を審査する。現在の試験は保持する。

責務先は**実装上のownerとレビュー引継先の役割**で、人名の割当て・実装依頼ではない。担当者・承認者・期限は未割当／未確定。通常の会計・停止・Permit等に関わる共通部分は§5の維持条件が優先する。

| ID／正規旧case | 元台帳上の検査主題・失われ得る検査対象 | 責務先と、個別照合後に必要な回復条件 |
|---|---|---|
| A1-U01／[SA-02](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-02) | 403/no_body。元本文を個別照合済み（文書のみ） | A1-S01へ明示対応。source status consumer→NS01／03。残差・未承認は保持 |
| A1-U02／[SA-03](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-03) | 404/no_body。元本文を個別照合済み（文書のみ） | A1-S02へ明示対応。同owner→NS01／03。403だけで代替しない |
| A1-U03／[SA-04](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-04) | 公開4method非再入。元本文を個別照合済み（文書のみ） | A1-S03へ明示対応。session／source→NS01／03。Dのnetwork非使用だけで代替しない |
| A1-U04／[SA-06](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-06) | 親の不正UTF-8 ff拒否。元本文を個別照合済み（文書のみ） | A1-S04へ明示対応。親取得／source→NS01。同byte列と拒否位置の静的根拠を保持 |
| A1-U05／[SA-07](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-07) | 異なる親sys_id拒否。元本文を個別照合済み（文書のみ） | A1-S05へ明示対応。親projection／source→NS01。必須列を保つforeign入力を維持 |
| A1-U06／[SA-08](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-08) | 親余剰script列拒否。元本文を個別照合済み（文書のみ） | A1-S06へ明示対応。親projection／source→NS01。余剰列拒否と秘密非出力の未assertを分離 |
| A1-U07／[SA-09](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-09) | profileのrelease_status=200拒否。元本文を個別照合済み（文書のみ） | A1-S07へ明示対応。status profile入口→NS01、変更時AP03。HTTP到着後の分類と入力拒否を分離 |
| A1-U08／[SA-10](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-10) | profileのrelease_status=401拒否。元本文を個別照合済み（文書のみ） | A1-S08へ明示対応。同入口→NS01／AP03。元invalid_input条件をnative HTTP401と同等扱いしない |
| A1-U09／[SA-11](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-11) | cleanup=objectの外部申告拒否。元本文を個別照合済み（文書のみ） | A1-S09へ明示対応。status profile入口／cleanup owner→NS01／03。同profileの拒否とtyped終端検査を区別 |
| A1-U10／[SA-12](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-12) | profileのsession field拒否。元本文を個別照合済み（文書のみ） | A1-S10へ明示対応。status profile入口→NS01／AP03。同名field・同入口で照合 |
| A1-U11／[SA-13](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-13) | profileのfetch=function拒否。元本文を個別照合済み（文書のみ） | A1-S11へ明示対応。同入口→NS01／AP03。通常の既存fetch注入は維持して閉鎖profileだけを区別 |
| A1-U12／[SA-14](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-14) | delay_ms=10001拒否。元本文を個別照合済み（文書のみ） | A1-S12へ明示対応。合成profile境界→NS01／AP03。元上限入力を維持し期限を延ばさない |
| A1-U13／[SA-15](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-15) | 既存fixed-200 transcript guard維持。元本文を個別照合済み（文書のみ） | A1-S13へ明示対応。fake pin／session→NS01／02。入力status指定とdispatch後非200拒否を分離 |
| A1-U14／[SA-16](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-16) | await前の親bytes copy・caller改変非採用。元本文を個別照合済み（文書のみ） | A1-S14へ明示対応。親bytes pin→NS01／02。同内容性を別pin実装の成功だけで代替しない |
| A1-U15／[SA-17](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-17) | status観測delay中取消・timer／admission。元本文を個別照合済み（文書のみ） | A1-S15へ明示対応。元run停止／status待機→NS01／03。同delay位置と先行理由を保持 |
| A1-U16／[SA-18](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-18) | 事前取消・ready／受理前停止。元本文を個別照合済み（文書のみ） | A1-S16へ明示対応。constructor／run owner→NS01／03。取得前効果は直接未assert |
| A1-U17／[SA-19](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-19) | 低減responseBytes上限。元本文を個別照合済み（文書のみ） | A1-S17へ明示対応。canonical会計／status取得→NS01。通常KP01も維持し、native同条件不足を残す |
| A1-U18／[SA-20](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-20) | 低減totalBytes上限。元本文を個別照合済み（文書のみ） | A1-S18へ明示対応。同会計→NS01。response capとの別条件を保持 |
| A1-U19／[SA-21](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-21) | request cap4のfinal4枠。元本文を個別照合済み（文書のみ） | A1-S19へ明示対応。予約owner→NS01。元登録owner・status経路で枠の維持を照合 |
| A1-U20／[SA-22](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-22) | request cap5のfinal4枠。元本文を個別照合済み（文書のみ） | A1-S20へ明示対応。同予約owner→NS01。cap4だけへ統合しない |
| A1-U21／[SA-23](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-23) | 元attempt floor・新期限を作らない。元本文を個別照合済み（文書のみ） | A1-S21へ明示対応。同run／attempt停止owner→NS03。floorと全run期限の理由写像を分離 |
| A1-U22／[SA-24](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-24) | 低減hard deadline・pending fake I/O取消。元本文を個別照合済み（文書のみ） | A1-S22へ明示対応。canonical停止owner→NS01／03。元の低減値deadlineMs=10を別期限へ置換しない |
| A1-U23／[ND-03](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-03) | 403/body=trueの一度受理。元本文を個別照合済み（文書のみ） | A1-S23へ明示対応。native issuer／consumer／上位診断→NS01／03。DN-01で旧ownerの3カウンター・slotを代替しない |
| A1-U24／[ND-04](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-04) | 404/body=trueの正常受理。元本文を個別照合済み（文書のみ） | A1-S24へ明示対応。同owner→NS01／03。body403・no_body404・取消404の別対照で代替しない |
| A1-U25／[ND-05](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-05) | 403/body=falseの一度受理。元本文を個別照合済み（文書のみ） | A1-S25へ明示対応。同owner→NS01／03。DN-02の操作0を旧assertionへ加算しない |
| A1-U26／[ND-06](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-06) | 404/body=falseの一度受理。元本文を個別照合済み（文書のみ） | A1-S26へ明示対応。同owner→NS01／03。DN-03と比較し、bodyあり正常系と区別 |
| A1-U27／[ND-09](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-09) | responseBytes=1の停止・診断。元本文を個別照合済み（文書のみ） | A1-S27へ明示対応。canonical会計／native取得／診断→NS01。親bytes全量計上と個別応答上限を分離 |
| A1-U28／[ND-10](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-10) | totalBytes=1の停止・診断。元本文を個別照合済み（文書のみ） | A1-S28へ明示対応。同owner→NS01。総量計上側の停止・上位診断をtranscriptだけで代替しない |
| A1-U29／[ND-11](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-11) | request cap4で発行0。元本文を個別照合済み（文書のみ） | A1-S29へ明示対応。予約／native上位診断→NS01。親dispatch前は静的根拠、予約数は元本文未assert |
| A1-U30／[ND-12](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-12) | request cap5で発行0。元本文を個別照合済み（文書のみ） | A1-S30へ明示対応。同owner→NS01。親通過後のrelease dispatch拒否は静的根拠、cap4と分離 |
| A1-U31／[ND-13](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-13) | 不正UTF-8の単一byte ff。元本文を個別照合済み（文書のみ） | A1-S31へ明示対応。親decode／native owner→NS01。同bytesのD transcriptは元のrelease HTTP欄・status消費を代替しない |
| A1-U32／[ND-14](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-14) | JSONの{}、resultなし。元本文を個別照合済み（文書のみ） | A1-S32へ明示対応。親projection／native診断→NS01。Dのbodyあり操作0と元上位診断・消費0を分離 |
| A1-U33／[ND-15](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-15) | foreign sys_idかつ必須4列不足。元本文を個別照合済み（文書のみ） | A1-S33へ明示対応。同owner→NS01。schema拒否を完全な親行でのtarget不一致と同等にしない |
| A1-U34／[ND-17](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-17) | 事前取消・native=null・会計／timerと後続fresh成功。元本文を個別照合済み（文書のみ） | A1-S34へ明示対応。constructor／run停止owner→NS01／03。factoryのcommit段階での停止と、一時確保なし／直接の枠計測を混同しない |
| A1-U35／[ND-20](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-20) | 実classの別run間で同Responseを再利用拒否。元本文を個別照合済み（文書のみ） | A1-S35へ明示対応。native identity台帳→NS01／03。Dのdelivery再投入や別Response・同stream拒否で先行履歴の検査を代替しない |
| A1-U36／[ND-21](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-21) | caller session供給拒否。元本文を個別照合済み（文書のみ） | A1-S36へ明示対応。wrapper入力→NS01／AP03。既存sessionを採らないこととfresh実classの同一性保証を区別 |
| A1-U37／[ND-22](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-22) | caller consumer供給拒否。元本文を個別照合済み（文書のみ） | A1-S37へ明示対応。wrapper入力→NS01／AP03。consumer値の拒否とprivate consumer一度限りの実行を区別 |
| A1-U38／[ND-23](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-23) | caller driver供給拒否。元本文を個別照合済み（文書のみ） | A1-S38へ明示対応。wrapper入力→NS01／AP03。外部driver fieldの拒否と内部固定driverを区別 |
| A1-U39／[ND-24](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-24) | caller cleanup供給拒否。元本文を個別照合済み（文書のみ） | A1-S39へ明示対応。wrapper入力／cleanup owner→NS01／03、互換はAP03。Dの別profile申告拒否と同一視しない |
| A1-U40／[ND-25](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-25) | caller binding供給拒否。元本文を個別照合済み（文書のみ） | A1-S40へ明示対応。wrapper入力→NS01／AP03。外部binding fieldの拒否と正規source／core照合を区別 |
| A1-U41／[ND-26](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-26) | caller fetch供給拒否。元本文を個別照合済み（文書のみ） | A1-S41へ明示対応。wrapper入力→NS01／AP03。通常fetch注入の維持と区別 |
| A1-U42／[ND-27](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-27) | 凍結診断copy・指定8key非露出。元本文を個別照合済み（文書のみ） | A1-S42へ明示対応。診断owner→NS01／03。Object.valuesの到達範囲と全graph不在を分ける |
| A1-U43／[ND-28](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-28) | 親Uint8Array.byteLengthのshadow非実行。元本文を個別照合済み（文書のみ） | A1-S43へ明示対応。親byte pin→NS01／02。Response／stream shadowとは別入力 |
| A1-U44／[ND-29](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-29) | proxy／accessor入力・shared親storage拒否。元本文を個別照合済み（文書のみ） | A1-S44へ明示対応。native入力pin／failure owner→NS01。error本文非露出の直接assertはない |

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

### SA-09〜14の追加個別照合（draft-0.4）

元artifactは同じP（実class＋fake I/O）、基準`6c6123e`の[source-status-binding.test.ts](../tests/review/source-status-binding.test.ts)。元宣言は6variant共通の`rejects non-profile input before creating authority`で、宣言にindex置換はない。正規台帳のvariantで識別し、実行fullNameを推測生成しない。6variantとも前節のhelperのchangeを`synthetic_status` profileへ上書き合成する入力であり、probe呼出しの最上位options（signal／limits）へ渡すものではない。throw／取消／時計faultの注入でもない。直接assertionは各variantとも`await expect(probe(change)).rejects.toMatchObject({code:'invalid_input'})`の1点だけである。

| ID／正規旧case・入力variant | 静的に読める拒否条件 | 直接assertしていない範囲 | 責務先・将来回復条件 |
|---|---|---|---|
| A1-S07／[SA-09](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-09)。release_status=200 | profile pinのrelease_statusが403／404のどちらでもない | 拒否codeだけ。HTTP 200 Responseやreaderは注入していない。後続fresh成功・timer0・session未生成も直接未assert | status profile入口→NS01、入力schema変更時はAP03。profile値の拒否とnative HTTP到着後の分類を別条件で保持 |
| A1-S08／[SA-10](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-10)。release_status=401 | 同じ403／404の値検査 | A1-S07と同じ。認証失敗としての分類・authentication_failedではない | 同入口→NS01／AP03。元invalid_inputをnative 401のauthentication_failedへ読み替えない |
| A1-S09／[SA-11](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-11)。cleanup={disposition:'confirmed'} | profileのcleanupがcancelled／no_body／unconfirmedの文字列でない | A1-S07と同じ。confirmed申告を後段で採用しないことや、reader cleanupの事実は直接対象外 | status profile入口／cleanup owner→NS01／03。pinを通るunconfirmed文字列はsession側でinternal_review_errorになる別条件（SA-05）で、本variantと統合しない |
| A1-S10／[SA-12](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-12)。session={} | profileの許可key（parent_bytes／release_status／cleanup／delay_ms）にないfield | A1-S07と同じ。実BoundedReadSessionを渡した入力ではなく、空objectの同名field。既存session不変・採用0は直接未assert | 同入口→NS01／AP03。同名fieldの余剰拒否を維持し、D rootへのlive session拒否で代替しない |
| A1-S11／[SA-13](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-13)。fetch=()=>{} | 同じ許可key外のfield | A1-S07と同じ。関数が呼ばれないこと・global fetch未呼出しは直接未assert | 同入口→NS01／AP03。通常sessionの既存fetch注入（K05）は維持し、閉鎖profileだけの余剰拒否として区別 |
| A1-S12／[SA-14](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-14)。delay_ms=10001 | delay_msが0〜10000の安全整数でない | A1-S07と同じ。上限等号10000の受理、負値・非整数の拒否はこのvariantにない | 合成profile境界→NS01／AP03。元上限を維持し、遅延を期限延長や別timerの根拠にしない |

#### 拒否位置の静的根拠と、確認していない範囲

[開発専用probe](../src/review/abort-scope-evidence-source-status-probe.ts)の`probeNewStatusAcceptance`は、最初のtryで最上位optionsを許可key（signal／limits／synthetic_status）に限定し、`pinStatusAcceptanceFakeIO`でprofileを検査する。profileはproxy・accessor・許可外keyを拒否し、release_status／cleanup／delay_msの値とparent_bytesの型・長さを確認した後にだけbytesをcopyする。どの検査で失敗してもBoundedReadError('invalid_input')に置き換え、module評価時に取得済みのfriend probeを呼ぶ前に終わる。したがってsession生成・snapshot pin・時計採取・fake生成・dispatchより前、という順序が静的に読める。

この順序は宣言名の「before creating authority」の静的根拠であり、元6variantがsession未生成・friend未呼出し・時計0・timer0・global fetch未呼出しを計測した証拠ではない。`probeNewStatusAcceptance`はasync関数なので、拒否はPromiseのrejectとして返る。同期throwかどうかは元caseの対象外である。SA-06〜08と違い、後続のfresh probe成功もこのcaseはassertしていない。

ここでの「friend呼出し前」は各probe呼出しからfresh生成継続へ入る前という意味に限る。module評価時の一度限りfriend取得は既に別の段階で行われ、取得0・権限不存在・撤去済みを意味しない。この6入力はprofileのkey／値検査でbytes copy・fake保持へ到達しないが、元testは例外text／秘密非出力・入力不変・run／construction／native診断も直接assertしていない。wrapperのcatchによる固定codeへの写像を、診断の全保持・全graph解放・失敗後再利用拒否の実測へ拡大しない。新規runを作らず拒否する位置と、既存moduleが保持するfriendの寿命・撤去責務（AP02）を分けて残す。

#### 独立D候補・compiledとの対応と残差

| 比較先 | 直接assertion | 元Pとの差・回復条件 |
|---|---|---|
| [DN-05](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dn-05)／[DN-04](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dn-04)、[development-native.test.ts](../tests/review/development-native.test.ts)のpreserves diagnostic-only HTTP %i（401／200／500） | streamを持つResponseを到着させ、ok=false、401はauthentication_failed・200はinvalid_response、status_consumptions=0、http.status、read=0／cancel=1／release_lock=1、reserved=0／release_attempts=1、stream unlocked・cancel1回 | HTTP到着後のnative分類で、元Pのprofile値入力拒否（invalid_input）とは別条件。台帳どおり差分参照のみで、SA-09／10は未対応のまま |
| [DN-14](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dn-14)、同ファイルのrefuses raw/proxy/copied deliveries and injected cleanup records | native入力へ`cleanup:{disposition:'confirmed'}`を余剰fieldとして加えた入力を含む5入力がinvalid_input、accessor読取0、その後の正規入力はok | 同じobject値だが、Dでは余剰field、Pではcleanup欄の値として拒否される。独立root／deliveryの検査で、元status profile入口の拒否を代替しない |
| [DS-25](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-ds-25)、[development-source.test.ts](../tests/review/development-source.test.ts)／[DR-20](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dr-20)、[development-root.test.ts](../tests/review/development-root.test.ts) | DS-25はaccessor／proxy／余剰consumer等をinvalid_input、active=0・accessor読取0・clock0。DR-20は`session:real`を含む入力をinvalid_input、getter／proxy呼出し0・実session状態不変・registered=0 | 余剰field・live session拒否の関連caseで、D側は採用0・時計0まで直接assertする。元SA-12の空object session fieldと同入口・同入力ではなく、この強い別assertionをPの既存保証へ加算しない |

SA-13（fetch=function）とSA-14（delay_ms=10001）には台帳上のD候補がない。[既存compiled SA fixture](../tests/review/fixtures/compiled-source-status-binding.mjs)は403／cancelled受理と404／unconfirmed拒否等を記述し、この6variantは収録していない。今回compiledの実行実績は追加しない。正規分類はSA-11／12が部分対応、SA-09／10／13／14が未対応で、A1-P07の処遇未選択・P09未承認。元入力・拒否codeの回復と、session未生成・時計0・friend未呼出し等の追加対照を分け、同元位置・正負対照・compiled artifactと終了確認を別承認後に揃える。旧試験・通常K01〜05を維持し、新friend・公開supplierを回復口にしない。

### SA-15〜24の追加個別照合（draft-0.5）

元artifactは同じP（実class＋fake I/O）、基準`8e8dbdf`の[source-status-binding.test.ts](../tests/review/source-status-binding.test.ts)。SA-15だけはstatus probeではなく既存の[固定fake composition入口](../src/servicenow/bounded-read.ts)（`prepareNewReviewComposition`）を直接呼ぶ。SA-16〜24は前節のhelper（`probe(change, options)`）を使い、profileのchange、または最上位optionsのsignal／limitsを変える。SA-19／20とSA-21／22は同じ`it.each`の別variantで、宣言の%s／%iを推測展開したfullNameは作らない。

| ID／正規旧case・入力／注入位置 | 直接assertion | 直接assertしていない範囲 | 責務先・将来回復条件 |
|---|---|---|---|
| A1-S13／[SA-15](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-15)。composition入口のsynthetic_ioで、release応答行へ`status:403`を追加（bytesは`{}`） | 呼出しが同期に`invalid_input`をthrowする | session未生成・dispatch0・既存guardの各位置は直接未assert。status probe側の入口ではない | fake pin／session→NS01／02。入力行のstatus fieldを拒否する条件として維持し、dispatch後の非200拒否（ACKB-02）や親行のstatus追加（ACK-33）とは別variantとして扱う |
| A1-S14／[SA-16](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-16)。parent_bytesとdelay_ms=1を渡し、probe呼出し直後にcaller側bytesを`fill(0)` | 返値のconsumptions=1、budget.requests=2、received_bytes=改変前の長さ | 解析した親内容が改変前と同じであること、copyの位置は直接未assert（成功したことからの間接証拠だけ）。fake timerは使っていない | 親bytes pin→NS01／02。await前copyと同内容からの解析を回復。総量一致だけで同内容性を証明しない |
| A1-S15／[SA-17](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-17)。fake timerでdelay_ms=1000、1ms進めてから外部signalをabort | reject `cancelled`、timer0、後続のfresh probeが`cleanup:'closed'`、その後もtimer0 | 取消された先行runのcleanup・予約返却・診断は直接未assert。fresh成功は新runの確認 | 元run停止／status待機→NS01／03。status観測delay中の同期失効を回復し、parent／release待機の取消（ACK-23／24）と統合しない |
| A1-S16／[SA-18](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-18)。既に取消済みのsignalを渡す | reject `cancelled`、timer0 | ready前・受理前・dispatch0・construction診断は直接未assert | constructor／run owner→NS01／03。取消済みsignalで生成と停止を分ける元factory互換を回復 |
| A1-S17／[SA-19](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-19)。limits.responseBytes=1 | reject `receive_budget_exceeded` | 課金後に超過したこと、失敗budget、後続fresh成功は直接未assert | canonical会計／status取得→NS01。response capを独立variantで維持 |
| A1-S18／[SA-20](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-20)。limits.totalBytes=1 | reject `receive_budget_exceeded` | A1-S17と同じ | 同会計→NS01。total capをresponse capと別条件で維持 |
| A1-S19／[SA-21](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-21)。limits.requests=4 | reject `request_budget_exceeded` | final4枠の予約数・拒否位置・後続fresh成功は直接未assert | 予約owner→NS01。cap4で枠を侵食しない受付を回復 |
| A1-S20／[SA-22](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-22)。limits.requests=5 | reject `request_budget_exceeded` | A1-S19と同じ | 同予約owner→NS01。cap5の進行prefixをcap4と同一視しない |
| A1-S21／[SA-23](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-23)。fake timerでdelay_ms=1000、1ms後に`performance.now`を10000へ進める | reject `upstream_unavailable`、timer0 | 新しい期限を作らないことは直接未assert（理由codeとtimer0からの間接証拠だけ）。deadline_exceededとの区別も1variant | 同run／attempt停止owner→NS03。元floor等号での写像を回復し、全run期限（deadline_exceeded）と分ける |
| A1-S22／[SA-24](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-24)。limits.deadlineMs=10、delay_ms=1000、`performance.now`を10へ進め10ms経過 | reject `deadline_exceeded`、timer0 | 期限を延ばさないこと・pending I/O取消の内部は直接未assert | canonical停止owner→NS01／03。低減deadlineMs=10を別期限へ置換せず、元timerでの停止を回復 |

#### 停止位置の静的根拠と、確認していない範囲

- **SA-15：** `prepareNewReviewComposition`は、session生成より前に`pinCompositionFakeIO`で応答行を検査する。行の許可keyはpurpose／bytes／delay_msだけで、statusを持つ行は`invalid_input`になる。fakeのdispatchは常にstatus 200のResponseを返す。これがfixed-200 guardの静的根拠である。
- **SA-16：** `probeNewStatusAcceptance`は、最初のawaitより前にprofileを検査してparent_bytesをcopyする。そのため、呼出し直後のcallerの`fill(0)`は内部copyに届かない。
- **SA-18：** session constructorは、取消済みsignalを受けると`construction.fail('commit','cancelled')`を記録し、`stop('cancelled')`した停止済みinstanceを返す。後続の処理はguardで止まる。
- **SA-19〜22：** canonical会計の`dispatchAt`は`requests >= cap−4`で`request_budget_exceeded`、`chunk`は累計がtotalBytesを超えると`receive_budget_exceeded`を返す。session側は親bytesを計上した後にresponseBytesを比べる。静的に読むと、cap4は親dispatchで、cap5は親1件の後のstatus dispatchで止まる。bytes上限は、どちらも親bytesを計上した後に止まる。
- **SA-23：** status windowのfloorは、開始時の残り時間から10000を引いた値（下限はreserveMs）で、観測後に残り時間がfloor以下なら`upstream_unavailable`になる。既定deadline 60000で10000進めると、ちょうど等号になる。
- **SA-24：** session生成時に、deadlineMsからの経過で`deadline_exceeded`を出すtimerが1つだけ設定される。fake observeのdelay timerはsignalのabortで解除される。

これらは実装を読んだ順序であり、元10caseが拒否位置・dispatch数・予約数・失敗runのcleanupを計測した証拠ではない。後続fresh成功をassertするのはSA-17だけで、他のcaseに足して数えない。

#### 独立D候補・compiledとの対応と残差

| 比較先 | 直接assertion | 元Pとの差・回復条件 |
|---|---|---|
| [DB-06](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-db-06)、[development-bootstrap.test.ts](../tests/review/development-bootstrap.test.ts)のrefuses caller-supplied status %i（403／200） | 全応答行にstatusを付けた入力が`invalid_input`、requests=0／received_bytes=0 | Dは独立rootのsummaryで、会計0まで直接assertする。元SA-15は同期throwの1点で、入口・入力（release行だけにstatus）も異なる |
| [DB-35](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-db-35)、同ファイルのpins all bytes before await | run呼出し直後に全行bytesを`fill(0)`、ok、requests=2、received_bytes=改変前の合計、bootstrap凍結 | 対象は全transcriptで、元SA-16はstatus profileのparent_bytesだけ。別pin実装の成功で元copyを代替しない |
| [DB-37](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-db-37)、同ファイルのcancels pending %s with no later charges（parent／release）、[DN-09](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dn-09)、[development-native.test.ts](../tests/review/development-native.test.ts)のjoins the same pending cleanup | DB-37はparent／release待機中の取消でcancelled、reserved=0、requests・received_bytesの値。DN-09はnative cleanup待機中の取消で同じcleanupにjoinし、confirmed・active=0・timer0 | どちらもstatus観測delayそのものではない。元SA-17の位置での失効を代替しない |
| [DN-12](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dn-12)、同ファイルのnever acquires an injected reader、[DR-17](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dr-17)、[development-root.test.ts](../tests/review/development-root.test.ts)のkeeps %s cancellation separate | DN-12は事前取消でcancelled、requests=0、native=null、release_attempts=0。DR-17のpreは実session状態不変と、construction primary＝commit／cancelled | Dは会計0や診断まで直接assertする。元SA-18はcodeとtimer0だけで、実factory互換は旧caseにだけある |
| [DB-27](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-db-27)／[DB-26](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-db-26)、development-bootstrap.test.tsのcharges the first whole chunk | 上限1で`receive_budget_exceeded`、requests=1、received_bytes=親の長さ、reserved=0 | 課金後超過をDは直接assertする。元SA-19／20はcodeだけで、Dの強い会計assertを元の保証に加算しない |
| [DB-21](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-db-21)／[DB-22](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-db-22)、同ファイルのkeeps four requests unavailable（4／5／6） | cap4／5で`request_budget_exceeded`、committed=min(2,cap−4)、reserved_peak=4、reserved=0 | Dは進行prefixと予約peakを直接assertする。元SA-21／22はcodeだけで、同じ登録owner・status経路での枠は旧caseにだけある |
| [DB-02](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-db-02)、同ファイルのuses the original clock（10000／50000／60000）、[DN-10](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dn-10)、development-native.test.tsのbounds pending cleanup by the original floor | DB-02はelapsed 10000でupstream_unavailable、50000でphase_deadline_exceeded、60000でdeadline_exceeded。DN-10はnative cleanup待機中のfloor | 同じfloorの関連試験。nativeの取消なしfloor→upstream写像を元status経路と同条件では検証していない |
| [DR-19](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dr-19)、development-root.test.tsのuses the original lowered deadline、[DN-11](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dn-11)、development-native.test.tsのkeeps the shared run deadline distinct | DR-19はdeadline_ms=10で`deadline_exceeded`、run_primary、active=0、timer0。DN-11は60000でdeadline_exceeded、run_stop、cleanup unconfirmed | 低減deadlineとnative run期限は別case。元SA-24のstatus delay中の低減10msと同条件ではない |

[既存compiled SA fixture](../tests/review/fixtures/compiled-source-status-binding.mjs)は正常403／cancelledの受理と404／unconfirmedの拒否等を記述し、この10caseの入力・limits・signal・時計注入は収録していない。今回compiledの実行実績は追加しない。10行とも正規分類は部分対応で、A1-P07の処遇未選択・P09未承認。元入力・code・timer0・fresh成功（SA-17）の回復と、拒否位置・dispatch数・予約数・失敗runの診断／cleanup等の追加対照を分け、同元位置・正負対照・compiled artifactと終了確認を別承認後に揃える。旧試験・通常K01〜05を維持し、新friend・公開supplierを回復口にしない。

### ND-03〜06の追加個別照合（draft-0.6）

基準`efb740b`の[元P試験](../tests/review/native-session-composition.test.ts)は、実`BoundedReadSession`／`BoundedUpdateSetSource`を使う閉鎖probeに、各回freshなResponseを渡す。親は同sys_idの固定5列JSON bytes、snapshotは合成per-user。bodyありでは空の`ReadableStream`を渡す（データ付き・EOF読み取りとは別）。bodyなしでは`null`を渡す。取消・時計・上限の追加注入はない。元宣言 `accepts %i/body=%s once, with no public release decision` の4入力を、実行せず本文から区別した。

各variant共通の直接assertionは6点：`r.ok=true`、`r.native?.counts`が **issued=1／consume_attempts=1／consumed=1** と厳密一致、`r.draft?.cleanup_kind`が下表の値、`r.run_diagnostic.internal=null`、`r.native?.upper.slots.authentication.http=null`、`r.native?.upper.slots.parent.http=null`。最後の2点はHTTP欄だけで、未観測purposeのslot全体一致ではない。

| ID／正規case | 元Response入力・期待cleanup | 独立D候補との対応・未代替条件 |
|---|---|---|
| A1-S23／[ND-03](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-03) | 403／body=true、cancelled | [DN-01](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dn-01)は相当body入力。reader操作・Dのsource消費を確認するが、旧nativeの発行／消費試行／消費と上位HTTP欄は別 |
| A1-S24／[ND-04](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-04) | 404／body=true、cancelled | [DN-01](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dn-01)は403/bodyあり、[DN-03](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dn-03)は404/bodyなし、[DN-09](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dn-09)は404/bodyありのrun取消。正常404/bodyありをこれらの合成で代替しない |
| A1-S25／[ND-05](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-05) | 403／body=false、no_body | [DN-02](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dn-02)に相当no_body入力あり。Dの操作0・JSON ack非消費は別assertionで、旧3カウンター・上位HTTP欄・実class結合を代替しない |
| A1-S26／[ND-06](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-06) | 404／body=false、no_body | [DN-03](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dn-03)に相当no_body入力あり。403やbodyあり／取消404への置換はせず、同じ旧owner・slotとの差を保持 |

[独立D試験](../tests/review/development-native.test.ts)では、DN-01はreader取得／cancel／closed／release_lock各1・read=0、stream unlock、source status消費1／release消費0を直接確認する。DN-02／03はHTTP status・body_present=false、cleanup confirmed/no_body、操作全0、source status消費1／release消費0、release_match=not_evaluatedを直接確認する。DN-09はcancel開始後にrunを取消し、cleanupを完了させてもcallerの結果はcancelled・source status消費0で、同404/bodyありの正常受理とは逆の結果になる。これらは別root・別台帳の観測であり、旧Pのcountや診断欄へ加算しない。

元4variantは、テスト名にある「公開release判断なし」を、返値のfield不在として直接assertしていない。draftのstatus・Permit／fallback／permissions、個別reader操作・unlock、`run_diagnostic.public`、release slot全体、construction copy、`accepted_before_close`、会計も、この4variantからは直接検査済みとしない。[別compiled fixture](../tests/review/fixtures/compiled-native-session-composition.mjs)は同4組を回し、Permit unavailable、C/G/P（2／親bytes長／0）、binding boolean、session消費1／native consumed=1、upper sealed、permissions全false、秘密非出力、bodyありunlockを直接検査する。このcompiled fixtureも元の3カウンター完全一致・cleanup種別・authentication／parent HTTP欄のassertionまでは代替しない。同ファイルの401故障や一度限りfriend取得は別対照。

[旧native root](../src/review/abort-scope-evidence-native-diagnostic.ts)と[session側](../src/servicenow/bounded-read.ts)の静的接続では、親bytesをpin・会計し、同実classの元lease／windowの下で注入Responseのrelease終端を旧native ownerが処理する。native側はreader参照を含む終端の照合・一度限り消費の試行を数え、固定bridgeのacceptから同sessionのprivate source consumerに接続し、最終受理後にnativeのconsumedを数える。session側のconsumptionsとは別計数で、両者を加算しない。外側closeと診断copyまでの所有はこの静的経路と別compiled対照に分け、4variantが全内部参照や全解放を直接測ったとは扱わない。

4行とも旧分類は部分対応、処遇未選択・受容未承認。回復には、NS01／03の責務として同4入力・同旧診断層の直接assertionと、独立Dとの共有／差分、実classと同reader／window／sourceの結合、close前受理と終了確認を個別に結ぶ。追加対照は旧assertionと分け、公開release判断や新発行権限を作らない。元試験・通常K01〜05を維持し、旧ND単体UN62／B-03・入口3行の処遇は別に残す。

### ND-09〜12の追加個別照合（draft-0.7）

基準`efb740b`の[元P試験](../tests/review/native-session-composition.test.ts)は、ND-03〜06と同じ実class＋fake I/O。各variantの変更は`limits`の1項目だけで、`probe(undefined, …)`は既定のfresh `Response(null, { status: 403 })` と正常な固定親bytesを使う。body付きreaderのspy、取消、時計注入、後続fresh確認はこれら4件にはない。

| ID／正規case | 低減入力・停止位置（後者は静的） | 元Pの直接assertion・移行候補 |
|---|---|---|
| A1-S27／[ND-09](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-09) | responseBytes=1。親全量を会計後、個別応答上限で停止 | caller codeとnative上位primary codeがともにreceive_budget_exceeded、release.http=null、received_bytes=親bytes長の4点。[DB-27](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-db-27)は別transcriptのresponse_bytes=1 |
| A1-S28／[ND-10](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-10) | totalBytes=1。親全量を加算したchunkが総量超過で停止 | ND-09と同じ4点。[DB-26](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-db-26)は別transcriptのtotal_bytes=1。個別応答上限と総量上限は別variant |
| A1-S29／[ND-11](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-11) | requests=4。final4枠を差し引き、最初の親dispatchの計上前に停止 | caller code=request_budget_exceeded、native.counts.issued=0の2点。[DB-21](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-db-21)はcap4の別transcript |
| A1-S30／[ND-12](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-12) | requests=5。親dispatch／計上・親ackを経た後、release dispatchの計上前に停止 | ND-11と同じ2点。[DB-22](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-db-22)はcap5の別transcript。元本文は親の進行数を直接検査しない |

#### 停止と計数の根拠

[実sessionのstatus経路](../src/servicenow/bounded-read.ts)は、native ownerの`begin`→予約・ready→親dispatch→親bytes取得→`chunk`→個別応答上限→親parse／ack→release用の`dispatch`→native `run`の順。[同core会計](../src/servicenow/review-canonical-budget.ts)は受信全量を加算してから総量超過を判定し、枠不足は `requests >= limits.requests - 4` で加算前に拒否する。元入力では両bytes caseが親1件分を計上して停止し、cap4／5はそれぞれ親の計上前／releaseの計上前に停止する。いずれも注入Responseのrelease観測に入る前だが、native ownerの生成・準備も0という意味ではない。停止時は[同ownerへの会計接続](../src/servicenow/review-evidence-lifecycle.ts)とsession／driver側の停止・解放経路を通る。上記はコードの順序で、4variantの実測結果ではない。

bytesの2件が直接見るのはrelease slotのHTTP欄のnullであって、全slot・全native操作0・cleanup完了ではない。request capの2件は上位primaryやrelease.http、予約peak、返却枠、C/G/P、consume_attempts／consumed、終了・timerを直接検査しない。発行0だけでこれらを補わず、同ownerに残る診断責務と追加検査を分ける。

#### 独立D・compiledとの差と回復条件

[開発transcript試験](../tests/review/development-bootstrap.test.ts)は、DB-26／27でok=false、receive_budget_exceeded、C/G/P=1／Dの先頭応答bytes長／0、reserved=0、release_attempts=1を検査する。DB-21／22はok=false、request_budget_exceeded、C=dispatches=0／1、G=0／Dの親bytes長、P=0、reserved_peak=4、reserved=0、release_attempts=1を検査する。cap6の成功は同宣言の別variantで旧caseへ加算しない。Dの親は別fixture値で、release_attemptsはrelease dispatch数やnative取得数として読み替えない。いずれも別rootの通常transcriptで、元実session／sourceとnative上位診断・発行カウンターの連続保証を代替しない。

[旧compiled native fixture](../tests/review/fixtures/compiled-native-session-composition.mjs)の通常受理・401故障等に、この4低減variantは収録されていない。4行とも旧分類は部分対応・処遇未選択・受容未承認。将来はNS01の会計・診断ownerへ同じ低減値、元親入力、停止位置と元の直接assertionを結び、必要な操作数・予約返却・終了確認を追加対照として分ける。元試験と通常K01〜05を維持し、B-03の別artifactや入口3行の処遇をここから自動変更しない。

### ND-13〜15の追加個別照合（draft-0.8）

基準`efb740b`の[元P試験](../tests/review/native-session-composition.test.ts)は、同じ実class＋fake I/Oの`probe(undefined, { parent_bytes: bytes })`で親bytesだけを置換する。固定targetはa×32、Responseは既定のfreshな403／bodyなし。元宣言 `retains invalid parent rejection before native acquisition %#` のindex 0／1／2を正規台帳と対応付ける。各variantが直接検査するのは **caller code=invalid_response、native上位のrelease slotのhttp=null、session側のconsumptions=0** の3点だけ。

| ID／正規case | 正確な入力・コード上の拒否位置 | 独立D候補と未代替の条件 |
|---|---|---|
| A1-S31／[ND-13](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-13) | index 0、`Uint8Array([0xff])`。fatal UTF-8 decodeで拒否。整形式UTF-8の不正JSONではない | [DB-29](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-db-29)は同じ単一byteの別transcript。decodeの呼出し箇所は別で、実session／native ownerのrelease HTTP欄とstatus消費は未代替 |
| A1-S32／[ND-14](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-14) | index 1、UTF-8の`{}`。JSON.parseは通るがresultがなく、親値schemaが拒否。`{"result":{}}`とは異なる | [DN-12](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dn-12)の親不正側は同じbytesだが、403／bodyありのD delivery。reader未取得を直接検査するが、Pの上位release slotとsession消費0の代替ではない |
| A1-S33／[ND-15](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-15) | index 2、`{"result":{"sys_id":"〈b×32〉"}}`（〈…〉は表記）。targetと異なるIDに加え、state／application／sys_updated_on／sys_mod_countの4必須列がない。schema失敗が先で、target不一致単独の分岐は通らない | [DB-30](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-db-30)は全5列の親でIDだけ変更する別transcript。共有の値検査でも拒否理由の位置が異なり、複合入力や同実classの診断を代替しない |

[session](../src/servicenow/bounded-read.ts)ではnative ownerのbegin／準備と予約・readyを経て、親dispatch→親bytes全量のchunk計上→fatal decode／JSON.parse→private親ack／consumerの順。ND-13はdecodeで止まり、親ackを作らない。ND-14／15は[実source](../src/review/bounded-source.ts)で親ackを取り出した後、[strict親値kernel](../src/servicenow/review-kernel/source-values.ts)が拒否し、親の格納・release状態への遷移に至らない。どのvariantもrelease dispatch／native runより前に停止するが、これはコードの順序であり、native owner未生成、会計0、操作数0や解放成功を元testが直接検査した意味ではない。特に`r.consumptions=0`はsessionのstatus終端受領数で、親ackの取り出し回数やnative側のissued／consume_attempts／consumedとは別。release.http=nullも全slotの空・全操作0・cleanup確認済みを意味しない。

[独立Dのbootstrap試験](../tests/review/development-bootstrap.test.ts)でDB-29／30はok=false／invalid_response、C=1、G=入力長、parent_consumptions=0、reserved=0、release_attempts=1、PRIVATE非出力を直接検査する。Dのparent_consumptionsをPのstatus consumptionsに、release_attemptsをrelease dispatchに読み替えない。[Dのnative試験](../tests/review/development-native.test.ts)でDN-12の親不正側はinvalid_response、C=1、native.http=null、get_reader／cancel／read各0、reserved=0を検査する。併設の事前取消側は別入力・別assertionで、cancel回数0・unlockはその後の検査である。Dのbodyありの操作対照を旧Pのbodyなしcaseの直接保証に足さない。

[旧compiled native fixture](../tests/review/fixtures/compiled-native-session-composition.mjs)は正常親での受理と401故障等を検査し、この3入力は収録していない。3行とも旧分類は部分対応・処遇未選択・受容未承認。将来の回復条件は、同入力・同停止層・元実session／sourceとnative上位診断の結合を保ち、元3項目と、必要ならrelease dispatch／reader操作／診断・終了確認の追加対照を別々に揃えること。元試験・通常K01〜05・入口3行／別gate UN62は維持する。

### ND-17／20の追加個別照合（draft-0.9）

基準`efb740b`の[元P試験](../tests/review/native-session-composition.test.ts)は実class＋fake I/O。同一の固定合成per-user snapshot／正常な親JSON bytesを使う。ND-17は一つの取消済みsignalを最初の呼出しにだけ、ND-20は同一Response参照を連続する二つのfresh probeへ渡す。未生成・一時確保後の回収・取得前の拒否は別の段階。

| ID／正規case | 入力と元testの直接assertion | 独立D候補と残差 |
|---|---|---|
| A1-S34／[ND-17](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-17) | fake timer下で呼出し前にcontroller.abort()。既定fresh Response（403／bodyなし）のprobe返値がcode=cancelled、native=null、budget.requests=0、まだ後続runを呼ぶ前のtimer数0、続くsignalなしのfresh probeがok=trueの5点 | [DN-12](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dn-12)の事前取消側は別root／deliveryのsummary。取消・requests=0・native=nullは対応するが、旧factoryの失敗copy・timer数と同じ実classのfresh成功は当該D対照にない |
| A1-S35／[ND-20](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-20) | 403／bodyなしの同じResponseで最初の結果aを得てJSON.stringify(a)を保存し、同じ参照で次の結果bを得る。a.ok=true、b.code=invalid_response、b.native?.counts.issued=0、再利用拒否後のJSON.stringify(a)が保存値と一致の4点 | [DN-13](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dn-13)の同Response／delivery拒否と同stream拒否はいずれも別境界。旧NDの同module台帳での取得前拒否・発行数・先行結果不変は未代替 |

#### 停止位置の静的根拠と直接検査の限界

- **ND-17：** [旧native wrapper](../src/review/abort-scope-evidence-native-diagnostic.ts)の親bytes pin／copy・driver準備後に、[実session factory](../src/servicenow/bounded-read.ts)が呼ばれる。constructorはcore／admission／登録owner／controller／deadline timer／listenerを確保し、commit段階末尾で事前abortを検出してconstructionにcancelledを記録する。direct-newが停止済みinstanceを返す既存契約と異なり、factoryはそれをcloseし、失敗codeとconstruction copyを返す。native probeは成功sessionを採用できず、composition開始・ready化・driver.beginによるnative owner生成・親／release dispatchへ進まない。timer数0は終了時の値で、元の枠・timerを取らなかった意味ではない。同じprincipalでsignalなしの後続fresh成功は枠が再利用できる対照だが、枠数・各slot解放・construction copyの内容・ready世代は元ND-17で直接assertされない。[constructionの別試験](../tests/review/construction-transaction.test.ts)はfactory copyのcommit／cancelled・teardown confirmedを直接検査しており、その期待値をND-17へ加算しない。
- **ND-20：** 二度目も同じ実classで新しいrun／native ownerを生成し、親の検査・会計とreleaseの計上を経てnative executeに入る。旧native moduleの`injectedResponses`はownerごとに作り直さないWeakSet。最初のrunはResponseを登録し、二度目はrelease attemptを開きclock／bridgeのguardを経た後、header検査の`injectedResponses.has(response)`で拒否される。status／body／bodyUsed取得、header記録、reader取得、終端発行より前であり、run生成やrelease dispatchの前ではない。これはソース上の順序で、元testがreader操作数・release slot・二度目の会計・registry状態を測ったわけではない。先行結果のJSON一致が直接保証するのは直列化した返値の不変だけで、先行ownerの全可変状態や後続第三runの成功までは示さない。

#### 移行先で観測する値と回復条件

[独立D試験](../tests/review/development-native.test.ts)のDN-12事前取消側は、別の403／bodyなしResponseでcode=cancelled、requests=0、native=null、release_attempts=0を検査する。その前の不正親・bodyあり側のreader／cancel／unlock検査はND-17の代替ではない。[Dのassembly](../tests/support/review/ef03/assembly.ts)もnative入力のpin後、構築commit段階の取消でnative owner生成へ進まないが、実sessionのfactory copyを扱わない。

DN-13は[開発専用delivery](../tests/support/review/ef03/native.ts)で同Responseから二つ目のdeliveryを作ろうとすると同期invalid_input、最初のdeliveryによるrunが成功し、消費済みの同deliveryは別rootの入力時にinvalid_inputとなる。さらに別Responseで同一streamを包む対照は、一回目成功、二回目ok=false／invalid_response／status消費0／get_reader=0。旧Pが二つ目の実class runのnative header段階で同Response参照を拒否するのとは、対象の同一性・受付時点・計数が異なる。Dは旧NDのResponse台帳を共有せず、先行返値の保存・後比較もこのcaseにない。

[旧compiled native fixture](../tests/review/fixtures/compiled-native-session-composition.mjs)は通常受理・401故障・friend再取得拒否を検査するが、事前取消／二run間Response再利用は収録していない。2行とも部分対応・処遇未選択・受容未承認。回復案はNS01／03の責務で元入力・直接assertion・同owner境界を対応付け、必要ならfactoryの段階、admission／timer返却、二度目のreader未取得、先行診断保持を追加対照として別記する。通常K01〜05・旧試験を維持し、台帳共有や新friendを代替にしない。

### ND-21〜26の追加個別照合（draft-0.10）

基準`cafe86e`の[元P試験](../tests/review/native-session-composition.test.ts)は、`rejects caller %s supply`の6 variant。`probe(undefined, { [key]: {} })`で、正常な合成per-user snapshot／固定target／親JSON bytesと既定のfresh `Response(null, { status: 403 })`を用意し、第3引数オブジェクトの最上位にown data propertyを1つ加える。各値は空オブジェクトで、実session・関数・cleanup証拠等を作って渡す試験ではない。唯一の直接assertionは各variantで **Promiseがrejectし、errorの`code`が`invalid_input`**。正常返却物・上位診断copy・error本文・操作／計数、getterやcallbackの非呼出しは直接検査しない。

| ID／正規case・fullName | 注入する余剰field | 旧分類・移行候補との差と回復時に保つ境界 |
|---|---|---|
| A1-S36／[ND-21](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-21) <code>rejects caller session supply</code> | `session:{}` | 未対応。Dの固定schemaは、この旧入口でcaller `session` 値を採用しないことの対照ではない。外部sessionの入口拒否を元実constructorの同core／登録世代保証やDの別root成功と分ける |
| A1-S37／[ND-22](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-22) <code>rejects caller consumer supply</code> | `consumer:{}` | 未対応。旧入口のcaller `consumer` を拒否しただけで、正規private consumerの呼出し回数や消費規則は検証していない。未採用の境界は正規consumer実行の対照と分ける |
| A1-S38／[ND-23](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-23) <code>rejects caller driver supply</code> | `driver:{}` | 未対応。同入口のcaller `driver` 拒否は、Dの固定deliveryや旧内部固定driverの動作保証と別。親bytes copy／driver組立て前の入力拒否を別対照で保持する |
| A1-S39／[ND-24](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-24) <code>rejects caller cleanup supply</code> | `cleanup:{}` | 部分対応：[DN-14](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dn-14)は独立Dの`native` profileに`cleanup:{ disposition:'confirmed' }`を追加しsummaryのcodeを検査する。旧probe第3引数の`cleanup:{}`に対するPromise拒否・後続処理に進まない境界と同等でない |
| A1-S40／[ND-25](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-25) <code>rejects caller binding supply</code> | `binding:{}` | 未対応。同入口でcaller `binding` を拒否する対照なし。`same_core`／`same_source`の診断や、生成済みのforeign handle拒否を入口の代替にしない |
| A1-S41／[ND-26](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-26) <code>rejects caller fetch supply</code> | `fetch:{}` | 未対応。同入口の`fetch:{}`拒否。SA-13の関数値や、通常sessionの`BoundedReadOptions.fetch`とは別。関数型fetchやglobal fetchの呼出し数は未assertで、通常fetch注入（KP05）は維持する |

**停止位置（静的根拠）。** [旧native wrapper](../src/review/abort-scope-evidence-native-diagnostic.ts)の`probeNativeStatusComposition`は`raw`の型／Proxyを検査し、`data`でprototype・own keyとdescriptorを調べ、data値を私有の一時オブジェクトに写す。その後の固定許可key（`signal`／`limits`／`parent_bytes`／`response`）照合で6件とも弾かれ、同じ条件式の親のtyped-array型検査、native getterによる親bytes copy、driver組立て、`nativeCompositionProbe`呼出しの前に`invalid_input`で止まる。よってその呼出しの実session／source生成・native owner生成・Response取得／reader・会計・driverのclose／disposeには入らない。rawの検査やhelperによるbytes／Responseの準備自体は行われ、module評価時に行う`takeNativeStatusCompositionProbe()`も別段階。『無割当て』『friend未取得』『操作0／cleanup完了を直接assert』とは記録しない。

[DN-14の元試験](../tests/review/development-native.test.ts)はcleanup申告のほかraw／proxy／copyのdeliveryとgetterの混入を組にし、各`invalid_input`、getter読み取り0、正規deliveryの後続成功を検査する。[Dの固定profile](../tests/support/review/ef03/native.ts)は`target`／`parent_bytes`／`delivery`の3keyで、cleanup追加はdeliveryの取得／消費前に弾かれる。getter計数はgetter variant用であり、cleanup variantに旧Pの直接assertとして足さない。共通入口・同一コードの共有はない。[旧compiled fixture](../tests/review/fixtures/compiled-native-session-composition.mjs)は正常受理／401故障／friend再取得拒否を持つが、6つの余剰fieldは収録していない。

**回復条件・責務。** 元probe入力を維持するなら、wrapper owner／NS01（cleanupはNS03も）で同6入力と`invalid_input`のPromise拒否を個別に揃え、固定許可keyのみの合成正対照を置く。driver／constructor／nativeの未到達を主張するなら別の独立対照で観測し、元の直接assertに加算しない。入口を撤去する案では、AP02のartifact上の不在とAP03のimport／返却互換性を別判断し、失われる旧拒否を不在検査や他methodの同期throwで代替済みにしない。通常経路の維持は§5、旧試験の処遇はAP05の別承認。6行とも旧分類と処遇未選択・保証低下未承認を保持する。

### ND-27〜29の追加個別照合（draft-0.12）

基準`47e5f3b`の[元P試験](../tests/review/native-session-composition.test.ts)は3つの台帳行。ND-27／28は固定合成per-user snapshot／同target・freshな403／bodyなしResponse。ND-29の不正入力3つは一つの旧caseに記録し、母数を増やさない。

| ID／正規case | 入力・直接assertion | 旧分類・独立Dとの差 |
|---|---|---|
| A1-S42／[ND-27](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-27) | 既定probe返値の最上位に`session`／`source`／`core`／`lease`／`terminal`／`consumer`／`snapshot`／`key`がない。`Object.values`で再帰して非null objectをすべて`Object.isFrozen`で検査し、`Object.values(r.draft!.permissions)`がfalse 7個と一致する | 部分対応。[DR-21](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dr-21)は別rootのwait拒否後の再帰freeze、PRIVATE文字列不在、登録・枠0。[DN-10](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dn-10)は取消後の元floorでのcleanup未確認とlate settle後のJSON不変。同じ成功返値・指定8key・7 permission値の検査ではない |
| A1-S43／[ND-28](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-28) | 正常親JSONの`Uint8Array`にown `byteLength` getterを追加。呼ばれれば`calls++`し`PRIVATE_LENGTH`をthrowする。このviewを`parent_bytes`に渡し、`r.ok=true`と`calls=0`を検査 | 未対応。[DN-22](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dn-22)はResponseの`status`／`body` getterとstreamの`getReader` shadowを置き、成功・shadow呼出し0・unlockを検査する差分参照。親viewの`byteLength`とは別で、同一コードの共有もない |
| A1-S44／[ND-29](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-29) | ①第3引数自体が`ownKeys` trap付きProxy、②第3引数がown `parent_bytes` getterとfreshな403／bodyなしResponseを持つobject、③helper経由の`parent_bytes`が`Uint8Array(new SharedArrayBuffer(10))`。3回ともPromiseが`code=invalid_input`でrejectし、①②共通の`calls=0`を最後に検査 | 部分対応。[DB-13](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-db-13)は別transcriptのauth getter／trapを仕込まないProxy／親shared bytes（1 byte）／余剰core・dispatchを拒否し、共通calls=0・active=0。[DN-14](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dn-14)は別native profileのdelivery getter・raw／proxy／copy delivery等の拒否。同じ3位置・Promise拒否を一体で代替しない |

#### 返却・停止の静的根拠と直接検査の限界

- **ND-27：** [sessionの固定probe](../src/servicenow/bounded-read.ts)はdriverのclose／disposeとsession closeを経てrun／construction診断・budget等の返値を作る。[旧native wrapper](../src/review/abort-scope-evidence-native-diagnostic.ts)の`probeNativeStatusComposition`はnative診断snapshotを付けて返却候補を凍結し、外側finallyの固定close／disposeを経る。再帰検査は`Object.values`で辿るown enumerableな文字列keyの値に限り、8keyの不在は最上位のみ。permission名、symbol／非列挙field、継承先、別closureの到達可能性、解放成功は直接検査しない。`budget`自体も不在検査の対象ではない。
- **ND-28：** 同wrapperは入口のdata descriptor検査後、module評価時に固定したTypedArray prototype上の`byteLength`／`buffer` accessorを使う。通常ArrayBufferのbrand検査と上限検査を経て、新しい`Uint8Array`へ固定`set`でcopyし、driverがその私有copyを使う。元試験が直接検査するのは成功とown getter非実行で、copyのidentity／bytes同一性／破棄を直接比較しない。
- **ND-29：** ①`types.isProxy`でrawのkey列挙前、②plain objectのown key列挙後に`data`がdescriptorを見てgetter呼出し前、③親viewの型検査と固定TypedArray accessorの後、通常ArrayBufferの`byteLength` getterをSharedArrayBufferに適用するbrand検査で停止する。③の内部throwは固定`BoundedReadError('invalid_input')`に置換し、①②も同codeで拒否する。新しい親bytes配列の確保・driver生成・各回のfriend呼出しより前という静的根拠で、無割当てや操作0の直接検査ではない。テスト名に例外本文非露出とあるが、元試験はmessage／stack／cause／直列化のいずれも直接検査しない。この拒否でrun／constructor／native診断は返らない。

#### 回復条件と責務

ND-27は診断copy owner／NS01・03で同成功返値の指定8key・同再帰範囲・permission値を揃える。全graph非露出や全解放を主張するなら別対照を追加する。ND-28は親byte pin owner／NS01・02で同親viewのshadowを残した正対照を置き、byte同一性・copy所有／破棄は別条件とする。ND-29は入口／入力pin ownerとNS01で同3位置の入力・Promise拒否code・共通calls=0を揃え、例外本文非露出・停止点別操作0は追加対照に分ける。入口を撤去する場合はAP02／03、旧試験・配布物の扱いはAP05で別審査し、旧caseの実行同等性にしない。

[旧compiled fixture](../tests/review/fixtures/compiled-native-session-composition.mjs)は正常受理時にpermission値がすべてfalseであることとJSONのPRIVATE文字列不在などを検査するが、ND-27の指定8key／再帰freeze、ND-28の親shadow、ND-29の不正入力3つは収録しない。分類（部分対応2・未対応1）、処遇未選択・保証低下未承認は維持する。

### 入口境界の追加個別照合：SA-25／26・ND-30（draft-0.14）

基準`c1f562b`の[SA元試験](../tests/review/source-status-binding.test.ts)と[ND元試験](../tests/review/native-session-composition.test.ts)を照合した。3件とも正規台帳の分類は未対応。既存実sessionへの付与拒否と、module内部に残る2つの取得口の非露出／再取得拒否は別の保証である。

| ID／正規case | 元testの入力・直接assertion | 残差と責務先 |
|---|---|---|
| A1-X01／[SA-25](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-25) | 通常の`new BoundedReadSession(snapshot())`を作り、①別の空objectをkey／sourceにした`claimPrivateCompositionSource`がfalse、②同sessionと有効なsource入力・空objectのkey付き第3引数（check／take／takeStatus／capture）で`new BoundedUpdateSetSource`が同期に`invalid_input`を含むerrorをthrow、③capture未呼出し、④sessionのrequests=0。finallyでsessionをcloseするが、その完了は直接assertしない | [DR-20](BEST_PRACTICE_ABORT_SCOPE_OLD_CASE_CROSSWALK_B02_DESIGN.md#n-dr-20)は別rootが既存実session等の持込みを拒否し、元session状態不変・登録0等を検査する差分参照。実source第3引数／claimの同位置を通らない。source生成・session owner→AP02／03（JS引数仕様）／05（旧試験の処遇） |
| A1-X02／[SA-26](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-sa-26) | SA probeを静的importした状態で①`Object.hasOwn(BoundedReadSession,'probeNewStatusAcceptance')`がfalse、②bounded-readを動的importして`takeStatusAcceptanceProbe()`を呼ぶと同期に`internal_review_error`を含むerrorをthrow。試験内で最初のtakeを直接assertしない | 代替caseなし。旧status取得口とclass非露出の対。公開境界／配布owner→AP02／05、名前付きimportの互換差はAP03 |
| A1-X03／[ND-30](BEST_PRACTICE_RELEASE_PRIVATE_CASE_MIGRATION_LEDGER.md#c-nd-30) | ND probeを静的importした状態で①`Object.hasOwn(BoundedReadSession,'probeNativeStatusComposition')`がfalse、②bounded-readを動的importして`takeNativeStatusCompositionProbe()`を呼ぶと同期に`internal_review_error`を含むerrorをthrow。SAとは別slotで、試験内で最初のtakeを直接assertしない | 代替caseなし。旧native取得口とclass非露出の対。公開境界／配布owner→AP02／05、名前付きimportの互換差はAP03 |

**停止位置・非露出の範囲。** SA-25の[session側claim](../src/servicenow/bounded-read.ts)は通常生成直後にcomposition keyがなくfalseを返し、`#compositionSource`の代入へ進まない。[source constructor](../src/review/bounded-source.ts)は`#session`の代入後、truthyなcreationのclaimで同期拒否し、callbackの採用・captureより前に止まる。これはコード上の位置であり、無割当て、全hook非呼出し、session全状態不変の直接assertionではない。元試験が観測するのはcapture未呼出しとrequests=0まで。

SA-26／ND-30は、[SA wrapper](../src/review/abort-scope-evidence-source-status-probe.ts)／[ND wrapper](../src/review/abort-scope-evidence-native-diagnostic.ts)がmodule評価時に対応する取得口を各1回呼び、bounded-readの別々の保存slotを空にする。2つの取得口はその後もmodule exportとして存在する。元試験が確認するのはclassコンストラクタの指定own property不在と、先行消費後の再取得拒否だけで、prototype・継承・別名・export・配布閉包全体の不在や、import順の全対照ではない。errorを`toThrow(string)`で検査しており、errorの`code`同値を直接検査する形ではない。

**別artifactの検査と将来条件。** [SA compiled fixture](../tests/review/fixtures/compiled-source-status-binding.mjs)はSA-26相当の2点（再取得は`{code:'internal_review_error'}`で検査）、[ND compiled fixture](../tests/review/fixtures/compiled-native-session-composition.mjs)はND-30相当の2点（再取得は正規表現）を持つ。SA-25の4点は両fixtureにない。[現行梱包検査](../tests/review/package-http-classification.mjs)はwrapper等の指定ファイルをパッケージから除外しつつ、旧compiled fixtureを配布外のdistから実行する構成であり、現行bounded-readの2取得export／claimの不在証明ではない。

[AP02／AP03設計](BEST_PRACTICE_RELEASE_AP02_AP03_REMOVAL_COMPATIBILITY_DESIGN.md)のT01／02へこの3件を引き渡す。SA-25はR02／03・C07で外部claim／callback閉包の不在、承認済みJS第3引数の扱いとcallback非実行、通常2引数と同ownerの初期source／Permit維持を対にする。引数個数・明示undefined／null／falseの仕様は未選択。SA-26／ND-30はR01／06・C06で、両取得関数だけでなくslot／static登録／runner／参照を候補artifactで確認する。名前付きimportのリンク時失敗やnamespace不在は、現行の取得後の同期拒否とは非同等。V01／02／04／06の通常経路正対照とalias／再露出等の負の対照を別承認後に確認し、単なる起動不能を不在成功にしない。3件とも旧試験は保持、処遇未選択、保証低下・撤去・互換変更・公開は未承認。

### 別gate UN62

| ID／対象 | 別管理の検査主題・責務先 | 扱い |
|---|---|---|
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

以下は専用case行への審査入口であり、6行を一括で受容する表ではない。6レビューの専用case行を本台帳の明細参照とし、原文を再copyして条件を二重管理しない。各旧case／assertionは当該行の元assertion列と将来条件を参照して個別票へ結合する。全行「旧試験維持／処遇未選択／保証低下未承認」。本書追加のSA-02〜04・06〜24／ND-03〜06・09〜15・17・20〜29はA1-S01〜44を参照する。入口の追加照合3行はA1-X01〜03、別gate UN62はA1-X04を参照する。

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

個別票は文書dataであり、runtime証拠・claim・発行口ではない。A1-R／Uの要約から自動で「受容」を選択しない。NS専用行119＋本書追加47の計166旧caseにも、まだ人の個別承認はない。

| ID／欄 | 必須内容 | 現在値・未記入時の扱い |
|---|---|---|
| A1-P01 識別 | 正規旧ID・元revision／宣言テンプレート／入力variant、対象lane・artifact、assertion列の参照 | IDは§2〜4／6へ結合。実行fullName・fault位置を推測生成しない |
| A1-P02 維持境界 | 該当K01〜05と共通source／owner・影響しない根拠 | 維持必須。影響不明はUnknownで審査保留 |
| A1-P03 保証／喪失 | 旧testが直接assertするcode／count／shape／診断・故障位置、何を失い何は残るか | 明示対応caseは元レビュー列／追加専用行を参照。入口の追加照合3行も旧assertionと将来の不在検査の差を記録済みで、処遇・承認は別。喪失は将来変更時の可能性で現在の退行判定ではない |
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
2. §3の初稿44行と入口追加3行は元本文を照合済み。入口7行の記録をAP02／03／05の判断票へ渡し、元assertionと撤去・互換変更後の受入条件を分ける。UN62はB-03の別gateに残す。未確認・保証差を群全体の受容で覆わない。
3. 明示対応済みの各旧caseもA1-P01〜10へ結合し、通常維持への影響・失われ得る直接assert・残差所有と回復条件を確定する。追加条件F01〜05と別gateを、失う旧保証へ混入しない。
4. 個別受容の可否はユーザーの別承認へ渡す。受容できなければ回復先行または候補リリース停止。旧試験削除・friend撤去・設定変更・実装・公開はここから開始しない。

AP01の判断材料が揃っても、保証回復・配布閉包撤去・最終品質・公開を完了とはしない。各閉鎖条件・Unknown・調査保留を維持する。

## 9 今回の静的確認

以下は初稿draft-0.1時の記録。追加個別照合の現在値・確認範囲は§2の追加表・§3のA1-S01〜44・A1-X01〜03と末尾のdraft-0.14記録を参照する。draft-0.1〜0.13の件数は各時点の履歴として保持する。

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

### draft-0.4：SA-09〜14の個別本文照合（2026-11-19）

基準`6c6123e`の元宣言／helper・6入力と直接1assertion、開発専用probeの最上位options／profile pinとfriend呼出し前の拒否順序、DN-04／05・DN-14・DS-25・DR-20の該当本文、既存compiled SA fixtureを静的に読んだ。6variantがprofileへの上書き合成であること、拒否位置の静的根拠と元caseの直接assertion（invalid_inputのrejectだけ）、Dの別入口・強い別assertionを分離した。session未生成・時計0・friend未呼出し・後続fresh成功を推測補完しない。

今回の開始時点で既に同2MDにdraft-0.4の未コミット変更があったため、その内容を保持して元本文・正規台帳と再照合した。照合中に既存分が`e1caa41`としてコミットされたことを確認したが、本作業ではstage／commitを実行していない。module評価時のfriend取得と各probeのfriend呼出しを区別する保持責務を補足し、AP01親文書のdraft-0.3時点の件数を履歴と明記した。補足は同2MDの未コミット差分として残し、元case・source／試験・承認欄は変更していない。

2MDの表20・ローカルlink138・明示anchor84、A1設計ID94（従来82＋S12）、正規228／6レビュー延べ123・重複除外119／重複4を確認。追加12旧caseは既存119と重複せず部分対応8／未対応4で正規台帳と一致、現文書対応131、閉鎖lane126／未レビュー32、全区分の専用行なし97（32＋入口3＋別gate62）と一致した。初稿U44の索引・重複4旧caseの両参照、通常K5群・AP01〜06未承認・処遇未選択を保持。ローカル参照・表列数・末尾改行・差分空白を静的確認した。変更はtrackedのMD2件だけで、製品・試験・設定変更0。製品module import／friend取得・試験再実行・build／pack・発行・Pushはせず、保証回復・実行同等性・個別承認・公開可の実績は追加しない。

### draft-0.5：SA-15〜24の個別本文照合（2026-11-19）

基準`8e8dbdf`の元9宣言／10variant（SA-19／20とSA-21／22は同じ`it.each`）、composition入口のfake pin、status probeのprofile pin、session constructorの取消済みsignal処理、canonical会計のdispatchAt／chunk、status windowのfloor、session deadline timer、D候補12件（DB-02／06／21／22／26／27／35／37、DN-09〜12、DR-17／19）の該当本文、既存compiled SA fixtureを静的に読んだ。元caseの直接assertion（code、timer0、SA-16の返値3項目、SA-17のfresh成功）と、停止位置の静的根拠・Dの強い別assertionを分けた。拒否位置・dispatch数・予約数・失敗runのcleanupを推測補完しない。

2MDの表22・ローカルlink168・明示anchor108、A1設計ID104（従来82＋S22）、正規228／6レビュー延べ123・重複除外119／重複4を確認。追加22旧caseは既存119と重複せず部分対応18／未対応4で正規台帳と一致、現文書対応141、閉鎖lane136／未レビュー22、全区分の専用行なし87（22＋入口3＋別gate62）と一致した。初稿U44の索引・重複4旧caseの両参照、通常K5群・AP01〜06未承認・処遇未選択を保持。ローカル参照・表列数・末尾改行・差分空白を静的確認した。変更はtrackedのMD2件だけで、製品・試験・設定変更0。製品module import／friend取得・試験再実行・build／pack・発行・Pushはせず、保証回復・実行同等性・個別承認・公開可の実績は追加しない。

### draft-0.6：ND-03〜06の個別本文照合（2026-11-19）

基準`efb740b`の元4variant・6直接assertion、DN-01／02／03／09・旧compiled fixtureの別assertion、旧native／session側の静的接続を照合した。対応済み文書145行、閉鎖lane未レビュー18行、入口3行・別gate UN62と区別した。旧分類・処遇未選択・AP01〜06未承認を維持。製品module import・試験再実行・build／pack・発行・コミット・Pushは行っていない。

静的確認では、正規228行・6レビュー延べ123／重複除外119・追加26を基準に残18／入口3／別gate62の差集合を再計算した。2MDの表23・ローカル参照184・明示anchor118、差分空白と対象範囲を確認し、stage0・製品／試験／設定変更0。これは独立Dやcompiled fixtureの再実行・保証回復ではない。

### draft-0.7：ND-09〜12の個別本文照合（2026-11-19）

基準`efb740b`の元4variant、bytes各4点／request cap各2点の直接assertion、会計とnative runの静的な順序、DB-21／22／26／27と旧compiled fixtureの別範囲を照合した。先行draft-0.6の未コミット差分を保持し、AP01の対象文書2件のみを更新した。旧試験・閉鎖条件・処遇未選択・承認状態は維持。製品module import・試験再実行・build／pack・発行・コミット・Pushは行っていない。

静的確認では、正規228行・重複除外119＋追加30＝149、残14／入口3／別gate62を再計算した。2MDの表24・ローカル参照198・明示anchor126と差分空白、stage0・製品／試験／設定変更0を確認した。移行・保証回復・承認の件数には加算しない。

### draft-0.8：ND-13〜15の個別本文照合（2026-11-19）

基準`efb740b`の元3入力・各3直接assertion、fatal decodeとstrict親値schema、DB-29／30・DN-12、旧compiled fixtureを静的に照合した。先行draft-0.6／0.7の未コミット差分を保持し、対象は同じAP01文書2件だけ。旧試験・閉鎖条件・処遇未選択・承認状態は維持。製品module import・試験再実行・build／pack・発行・コミット・Pushは行っていない。

静的確認では、正規228行・重複除外119＋追加33＝152、残11／入口3／別gate62を再計算し、2MDの表25・ローカル参照211・明示anchor132、差分空白、stage0・製品／試験／設定変更0を確認した。初回の補助集計は前回の4行抽出を引き継いでND-12も拾ったため、今回の3行に訂正して再確認した。製品試験の結果・旧保証の回復判定ではない。

### draft-0.9：ND-17／20の個別本文照合（2026-11-19）

基準`efb740b`で事前取消の5直接assertionと二run間Response再利用の4直接assertion、factory経由の停止位置・旧native headerでの拒否位置、DN-12／13と別construction／compiled対照を照合した。先行draft-0.6〜0.8の未コミット差分を保持し、対象は同じAP01文書2件だけ。旧試験・閉鎖条件・処遇未選択・承認状態は維持。製品module import・試験再実行・build／pack・発行・コミット・Pushは行っていない。

静的確認では、正規228行・重複除外119＋追加35＝154、残9／入口3／別gate62、2MDの表26・参照223・明示anchor136、差分空白とstage0を確認した。初回の補助検査は台帳の「二つ目」と親文書の「二度目」を取り違えて停止し、照合語を訂正して再確認した。製品・試験・設定の差分はない。

### draft-0.10：ND-21〜26の個別本文照合（2026-11-19）

基準`cafe86e`で元6入力・各1直接assertion、固定allowlistの停止位置、DN-14と別artifactの検査範囲を静的に照合した。確認対象はAP01の2MD、正規228行・重複除外119＋追加41＝160、閉鎖lane残3／入口3／別gate62。旧試験・閉鎖条件・処遇未選択・承認状態は維持。製品module import・試験再実行・build／pack・発行・コミット・Pushは行っていない。

静的確認では、2MDの表27・ローカル参照235・明示anchor146、差分空白とstage0を確認した。製品・試験・設定の差分はない。

### draft-0.12：ND-27〜29の個別本文照合（2026-11-19）

基準`47e5f3b`で元3caseの直接assertion、返却／停止位置、DR-21／DN-10／22・DB-13／DN-14と旧compiled fixtureの差を静的に照合した。対象はAP01の2MD、正規228行・重複除外119＋追加44＝163、閉鎖lane残0／入口3／別gate62。旧試験・閉鎖条件・処遇未選択・承認状態は維持。製品module import・試験再実行・build／pack・発行・コミット・Pushは行っていない。

静的確認では、2MDの表28・ローカル参照247・明示anchor151、差分空白とstage0を確認した。製品・試験・設定の差分はない。

### draft-0.14：SA-25／26・ND-30の入口境界照合（2026-11-19）

基準`c1f562b`で元3caseの直接assertion、sourceのclaim拒否位置、別slotのmodule評価時取得、DR-20とcompiled／梱包の検査範囲を静的に照合した。対象はAP01のMD 2件だけ。旧試験・処遇未選択・未承認・各閉鎖条件を保持し、製品module import・friend取得・試験再実行・build／pack・発行・コミット・Pushは行っていない。

静的確認では、正規228行・重複除外119＋閉鎖lane追加44＋入口追加3＝166、閉鎖lane残0／入口残0／別gate62を再計算した。2MDの表29・ローカル参照258・明示anchor152、差分空白とstage0を確認した。初回の補助照合は2試験のimport表記の空白差で停止し、空白を許容して再確認した。製品・試験・設定の差分はない。
