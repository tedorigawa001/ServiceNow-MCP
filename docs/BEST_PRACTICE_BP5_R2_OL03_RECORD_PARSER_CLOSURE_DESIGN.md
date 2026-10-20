# BP-5 R-2 OL-03：厳密record parser・全closure集合の再検証接続

Version: draft-0.10 / Date: 2026-10-20 / Status: 同round宣言・index model/shape/上界を内部実装し合成検証。全工程のwork事前受付・実reader/collector・運用承認は未実施。

## 1. 範囲と停止境界

[FD移譲設計§15](BEST_PRACTICE_BP5_R2_OL03_SECURE_FD_TRANSFER_DESIGN.md)の合成`RecordSource::revalidate`を、既存の厳密parserと**全closure集合**の検証へ置き換える設計。
前工程の[424件の合成検証](E2E_BEST_PRACTICE_R2_OL03_RECORD_FINAL_SYNTHETIC_2026-10-20.md)は、架空の非JSON bytesと手動投影の契約試験であり、本書の接続が動く証拠ではない。

draft-0.1/0.2の成果物はMDだけだった。後続の§10でJSON core、§11でactivation/ledger/registry、§12でclosure index/全集合の純粋検証、§13で合成sourceによる再読pipeline接続を追加した。telemetry調査は保留。実record/closure sourceへの接続、実機/PDI操作、API実接続、token発行、設定変更、実署名、本番policy投入、permit発行は対象外。
APPROVED_REGISTRY=None、通常v2入口Unavailable、runtime gate92、DER/absence停止を維持する。parser/集合照合の成功も実行許可にしない。

## 2. 現状と接続上の不足（ソース照合）

| 既存部品 | 再利用する検査 | そのまま接続してはいけない点 |
|---|---|---|
| [json.rs](../native/r2-outer/src/json.rs) | UTF-8、duplicate key、trailing data、深さ16、container item上限、typed decode | `Instant`だけでcancelなし。Value木→型の二段階allocation。max_itemsは各containerの上限で、総node数/RSSの上限ではない。deadlineをInvalidRecordへ畳む箇所がある |
| [schema.rs](../native/r2-outer/src/schema.rs) Activation/LedgerV2/Time | deny_unknown_fields、schema/field/path/hash/version/platform、承認時刻/期限 | 必要fieldの一部はprivate。Time/Runtime/BinaryV2の限定viewが必要。公開getterや利用者JSONによるauthority生成にしない |
| [ledger_v2.rs](../native/r2-outer/src/ledger_v2.rs) parse_bound_ledger | exact ledger hash→decode→validate→activation context/registry両roleの結合 | 元Instantが必要。内部に460秒/450秒とelapsed加算がある。新しいstartや現在wallを無造作に渡すと期限意味が変わる |
| [signature_policy.rs](../native/r2-outer/src/signature_policy.rs) | 固定registryのstrict parse、digest/id/schema、Launcher/Node policy role | ParsedRegistryは純粋データ。利用者からregistryを受け取らず、信頼済みbuild bytesのproducerが必要。現在その本番bytesは未投入 |
| [closure.rs](../native/r2-outer/src/closure.rs) check/declared | 全indexのstrict decode、hash/release/generation、path順序/親directory/case衝突、mode/size/hash、全expected/actual集合一致 | `check`のobservedは呼出側入力。`declared`は宣言自身でcheckした結果で、OS観測ではない。CheckedIndexは件数/総量だけであり鮮度/identityを持たない。declaredは現在macOS arm64 cfg内 |
| [deployment.rs](../native/r2-outer/src/deployment.rs) | directory FD相対resolve、directory names完全一致、全file hash、identity重複拒否、snapshot再照合 | 独自total/Instant判定、cancelなし。公開inspectはpathを入力しcountsを返す。record/pinsの共有予算へ未接続。indexのobserved entryはpinされた値を挿入するため、そのbytes/hashの読取証拠は別に必要 |
| [records_v2.rs](../native/r2-outer/src/records_v2.rs) | activation/ledger読取・context/groups・registry・前後再読 | 内部で新しいInstantを作る。index/全closure検査は行わない。公開InspectedV2Recordsを初回record/closure証拠の代用にしない |
| [topology/records.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records.rs) | pinsのbytes/hash/path/metadata、M4前後、clock、payload課金 | revalidate(bytes)には共有予算/context/観測集合がなく、sourceが任意のRecordBindingを返せる合成境界。実parser/full scanをこの1呼出しの中に隠さない |

根拠は上記リポジトリ内ソース。新しい外部仕様・OS適合の検証は行っていない。

## 3. 接続モデル案：I/Oと意味検証の分離

以下はprivate型/関数の設計名。後続§13の内部接続はこのモデルの限定実装で、OS観測の真正性を持つproducerは未実装。

| 型/境界案 | 所有・結合・権限 |
|---|---|
| InspectionContext | 元SharedBudget/clock pair、execution UID/groups/platform、固定registry由来のParsedRegistryを同じsessionで保持。公開Context/JSONからmintしない |
| ExactRecordSet | 再読で初回bytes/metadata/pathと一致した3件へのborrow。元pins/lineage・再読roundを保持。sourceが成功boolだけで作れない |
| ParsedRecordProjection | Activation/LedgerV2とindex全宣言から導出する比較用projection。全binding/target照合に使うだけでtrust tokenではない |
| PinnedClosurePlan | strict indexの**全entry**、index/Nodeのrelative path、root、release/generation/digest、全宣言量を固定。Node entryだけの部分planは禁止 |
| CompleteClosureObservation | 同じsession/roundで全directory names・全file hash/metadata/pathを走査し終えたprivateな完了値。scan中の部分結果からは作れない。非Clone/非serialize、Debug固定 |
| verify_record_set | ExactRecordSet・registry/context・そのroundのCompleteClosureObservation・元SharedBudgetを借用し、strict parseと全集合照合を行う。path open/外部通信は行わない |

`RecordIoSource`相当には既存の単発open/read/observe/clockだけを残し、意味投影を任意sourceへ委譲しない。
再検証は固定のverifierをpipeline側が選ぶ。利用者指定callback/registry/path/observed配列・`is_complete=true`は受付けない。
既存public parser/check関数は純粋データAPIとして互換維持し、接続側だけが使うprivateなbudget-aware core/限定viewを設ける案とする。

## 4. strict parse・bindingの順序

1. 元checkpoint、初回受付の残期限460秒超、receipt/context/lineageを確認。元pinsの長さ/hash・初回の保護された読取証拠が不足なら停止する。
2. 再読3件のexact bytes/metadata/path一致を確認してからExactRecordSetを作る。再読後に得たpath/hash/世代でpinsを更新しない。
3. activationをstrict decode→Activation::validate。固定path、execution UID、reader GID/実効groups、release/generation、ledger/index hash、承認時刻/期限を初回contextと照合。
4. activationがpinしたledger exact hashをdecode**前**に確認。ledger-0.2専用parserを使い、legacy ledger-0.1へfallbackしない。platform/registry/schema/id/digest/両role policy・activation fieldを照合する。
5. ledgerのroot/index/Node absolute pathからcomponent単位でrelative pathを投影。文字列prefixだけで包含を決めない。closure::path等のstrict条件と一致させ、pathを正規化して不正入力を救済しない。
6. ledger/activationがpinしたindex exact hashをdecode**前**に確認。closure::check自体はdecode後にhashを確認するため、接続adapterで事前hashを省略しない。index全体をstrict decodeし全宣言を検査する。
   **補足（将来の実装候補）**：ledger_v2はレビュー指摘を受けて公開関数自体を「hash照合→decode」の順へ修正済み（`e9d4b8e`）。`closure::check`/`declared`も同様に関数内で先にraw hashを照合すれば、adapterが事前照合を省略する余地がなくなり、activation/ledger/indexの3種類で順序がそろう。hash不一致時の公開戻り値の種類（現状Invalid等）が変わり得るが、いずれも拒否であることは変わらない。採否と既存試験の期待値更新は実装時に別途判断する。
7. release/generation/index hash、registry両role、Node ledger hash=index entry hash、Indexed size/mode0555・固定entry pathを初回BoundTargetと比較。launcherのsize/root承認待ちは解消したことにしない。
8. 同roundの全closure観測に対して集合照合する（§5）。初回投影との全field一致と現在clock/450秒超を確認し、限定比較結果だけを返す。

初回にのみ必要なschema/build_receipt/source_revision/lockfile等もvalidateで落とさない。RecordBindingへ投影されないfieldでもexact bytes一致を要求する。
現在privateなbinary path/hash/version、runtime root/index/entry/cwd、時刻の取得は同module内のprivate view/導出関数で解決し、serde fieldをpublicへ広げる方法は採らない。

### 4.1 時刻を二重加算しない

ledger_v2の現context.start_wall_msは**元開始wall**であり、関数末尾で元startedからのelapsedを加える。
再検証時の現在wallをcontext.start_wall_msへ渡し、同時に元startedを渡すとelapsedを二重計上する。逆に新しいInstantを渡すと全体期限をresetする。

推奨は純粋なschema/binding検査とtime検査を内部coreで分離し、admissionでは元開始wallで460秒超、再検証では元clock pairから得た現在wallで450秒超を適用すること。
既存public parse_and_bindのtime意味は維持する。core分離前の暫定接続でも元開始wall/元Instantだけを渡し、現在clock検査は別に行う。現在wallで460秒を再要求しない。
FD移譲設計§15の実clock起点/丸めによる2ms誤拒否の選択は未解決のまま残し、本書で許容を広げない。

## 5. 「全closure集合」の完了条件と鮮度

- 宣言全entry＋index自身の1 entryを対象にする。全directoryのchildren名集合を実列挙と照合し、extra/missing/duplicate/case衝突・親directory欠落を拒否する。expectedをそのままobservedへコピーしない。
- 全fileは同じsessionの保持root/固定resolveから取得し、metadata/size/EOF/hashを確認する。hardlink/identity重複・symlink・別device等の既存拒否条件を維持する。index自身も実読取のexact bytes/hash/identityを要する。
- Node entryのbytes検査は同じ所有leaf/source・初回snapshotへ結合する。namespace再openは比較専用にし、そこで得た別FileをA/Bのsourceへ差し替えない。現在のdeployment scannerはNodeも独立resolve/readするため、そのまま運用sourceへ接続しない。保持sourceの限定借用と、追加読取でも元の要求数/予約/cancel台帳をresetしない内部adapterが必要。
- 各entryのsnapshotとpath再解決、root/祖先再照合を完了してからのみCompleteClosureObservationを作る。利用者のVec<Entry>やCheckedIndexのcountsからは生成しない。
- observationにはsession lineage、index exact digest、root/承認record binding、release/generation、scan round/完了順序を内部結合する。別root・別世代・前round・別session・部分scanは拒否する。単なるTTL/時刻の新しさでは代用しない。
- 既存Entry/closure::checkはinode情報を表現しないため、集合一致だけでidentity/path保証を主張しない。private observationが別にmetadata/path証拠を保持し、checkの前後で確認する。

### 5.1 呼出し順の推奨案

| 段階 | 必須処理 |
|---|---|
| 初回 | 固定registry/context→安全なrecord取得→strict parse/全plan→全closure scan/集合照合→receipt/BoundTargetのprivate導出 |
| M4前 | B→target topology→3件record再読→strict parse/plan固定一致→**そのroundの新しい全closure scan**→全集合照合→recordのbytes/metadata/path再確認→clock→M4 |
| M4後 | 3件record再読→strict parse/plan一致→**最終roundの新しい全closure scan**→全集合照合→record再確認/clock→未実装のlease最終確認→限定結果 |

scan中にrecordが変わらなかったことを確認するため、scanの前後をrecord再読で挟む。後側もstrict binding/time確認を省略せず、同bytesであることを理由に初回判定へ戻らない。
scanの前後で新しいplanへ追従しない。同じpins/planでの同一呼出しretryもしない。
初回scanのキャッシュだけでM4前/後の完了値を作る案は採らない。将来lease下で再利用を最適化する場合は別設計・承認とする。

これは運用接続の推奨順序。後続§13のstrict経路は合成scan境界とscan後追加record再読を実装したが、実full scanはない。revalidateの1呼出し内へ全scanを隠して実装済みに見せない。
全scan中にもtarget/recordが変化し得るため、各snapshot/前後検査でも原子性やABA排除は保証しない。実行許可へ接続するには更新排他・寿命設計が別途必要。

## 6. 共有予算と事前受付

既存枠を自動拡大せず、全role/roundで同じ台帳を使う。

| 項目 | 接続で具体化する条件 |
|---|---|
| 時間/cancel | 元の10秒/Instant/clock pair・sticky failureをparser visitor、文字列/bytes走査、hash chunk、各entry/親prefix/集合操作、source境界の前後に伝播。parseごとにnew Instantを作らない |
| record/index | activation/ledger各64KiB、index16MiB、record/index JSON深さ16、registry64KiB/深さ8・policy2〜32件を維持 |
| 集合 | index100,000宣言＋実index1件は**形式上限**。実行可能件数の保証ではない。100,000件は16,384契約call枠へ一般には収まらない |
| payload | 元2GiBへ初回record/closure、M4前後の全scan、scan前後record再読、A/B/preflight、extra EOFを含む成功copyを重複分も課金。hash済みbytesのCPU再検査はI/Oへ二重課金せずwork枠へ課金 |
| 予約 | A/B専用creditをrecord/closureへ流用しない。受付時に全round予定量をchecked算術で算出し、共有の別予約と既存creditを合計して枠内だけ受理。新しいrole/scanで2GiBを作り直さない |
| 呼出し | 元16,384契約callをrecord/topology/closureで共有。sourceが内部で全scanを行って1回と数えるのは禁止。実syscall/copy/cleanup枠の導出は別途必要 |
| names/metadata | 既存M0〜M4の100 call/640KiBを維持。closure directory namesとxattr名を混同しない。追加names台帳/8MiB候補・FS/ACL取得配賦は運用承認待ち |
| FD | target保持chain＋leaf＋一時2の132構造上限を維持。closure scanはstreaming/再walkを用い、別の全chainを同時保持しない。record/lease/process全体の実FD・解放予約は未接続 |
| positioned I/O | 既存targetの32768要求/EINTR共有8回を維持。Nodeをclosure scanでも再読する場合にReadScopeを作り直して要求数をresetしない。record readの非retry契約とpayload課金も維持する |

宣言総量が2GiB以内でも、全scanを初回/M4前/M4後に行いA/B・record再読を加えた**実I/O予定量**は2GiBを超え得る。その場合はLimitで開始前停止する。
同様に、少量の深いpathや多数のzero-byte fileはpayload枠内でもcall枠を超え得る。全path深さ/観測回数/EOF要求を含む上界を受付で算出し、収まらなければscanを開始しない。
実copyが予定より増えた場合も同じ台帳で即停止する。残量不足をpartial成功、Nodeだけの検査、metadataのみの検査へ格下げしない。

### 6.1 CPU・allocationの追加設計候補（未承認）

bytes/depth/container件数だけでは全allocation/RSSやcancel応答間隔を保証できない。現在のValue木＋typed object＋BTree集合の同時保持を無制限に継承しない。

- parser/work予約は全再parse/roundで共有する。候補は最大1,000,000 work units（JSON node/key/entry/prefix/集合操作、長い文字列・hashの64KiB chunkを各1単位）で、算術overflow/枠超過をLimitとする。allocatorや比較関数内部の処理量まで証明した値ではない。
  **work上限から導く実効件数（レビュー時の概算、2026-10-20、全集合照合の課金を反映）**：実装済みのstrict core（`json/shared.rs`）の課金では、file entry 1件（5 key中4つが文字列、1つが数値）がnode・key・文字列・挿入を合わせて約26 unitを使う。これに`check_entries`のentry検査、親確認ループのentryごとの処理と各prefix確認、観測側挿入、要素ごとの比較が加わる。pathが5段程度（親prefix約4個）なら約8 unit増え、parse＋全集合照合は合計約34 unit/entryとなる。上限1,000,000では1回でおよそ2.9万entry、§5.1どおり初回・M4前・M4後の3回ではおよそ1万entryが目安となる。index形式上限100,000件は実効上届かない（§6の呼出し枠と同じ性質）。
  参考：本プロジェクトの本番依存閉包は、本番依存140 packageのfile約4,100件と`dist`の488件で、directoryを含めても5,000〜6,000件程度と見積もられ、3回のparse＋照合で約51万〜61万unit（概ね60万unit）の見込み。100万unitには収まる見込みだが、decodeだけの旧見積り約40万unitより余裕は小さい。これらは典型的なfile entryとpath深さに基づく概算であり、受付の安全な上界ではない。受付時には実際のfile/directory構成・全path深さ・全roundと追加の宣言検査、hash chunk・固定処理・registry/activation/ledgerのparse分を含む上界をchecked算術で別途計算し、超える計画は開始前にLimitで停止する。from_value変換内部を含む実測CPU量・実行時間を保証した値でもない。
  **§13の初期接続時（§15適用前）の追加コスト**：当時のstrict pipelineは1roundにつきscan前declare・全集合check・scan後declareの3回、全3roundでindexを9回parseしていた。activation/ledger/registryもscan前後の計6回検証する。上の「3回で約60万unit」はこの初期pipeline全体の見積りではなく、そのまま受付根拠に使わない。典型的な深さのfileだけならindex部分は約294 unit/entry（26＋宣言検査約6、全集合検査約34、26＋宣言検査約6を3round）で、5,000〜6,000件では約147万〜176万unitとなり、暫定100万capを超え得た。directory構成・Node検索・固定処理等を含む実測値ではない。§15でdecodeを全3回へ減らしたが、厳密な事前予約・費目上界は未対応で、本番閉包が通るとは主張しない。
- allocation候補はparse作業同時64MiB、inspection管理下の総同時128MiB。元pins（最大16MiB＋128KiB）・registry・観測集合・path/keyの複製・bufferを合計し、事前予約とDrop時解放を行う。これは**RSS上限ではなく管理allocationの候補**。
- Value木と型/expected/actual mapの重複を減らすbounded typed decoder/限定内部viewを検討する。duplicate key/unknown field/trailing data/深さ/件数拒否を弱める変更は不可。container上限は要素decode前にも確認できる境界を設計する。
- 現codeのmax_itemsを総node枠と説明しない。単一巨大stringのunescape/UTF-8、serde_json::from_value、BTree比較等にcheckpointが入らない区間も洗い出す。

work/allocation値・単位・計上箇所と最悪メモリを実装前に合成試験設計で承認する。未承認/計上不能の運用経路はUnavailableで停止し、global allocatorの変更やhard RSS保証へ読み替えない。
同期parser/OS呼出しが復帰しない問題は協調cancelだけで解決しない。外側監督・終了設計を維持する。

## 7. 失敗時停止・理由の写像案

parser/checkの文字列エラーやpath/record bytesをログへ転送しない。まず元budget.checkpointとsticky failureを確認し、既存のDeadline/CancelledをInvalidRecordへ潰さない。

| 原因 | 内部の既存有限Failureへの接続案 |
|---|---|
| schema/duplicate/unknown/trailing/旧版混在、strict構造不正 | Binding（無効recordという検証分類をテスト名/設計に残す） |
| expected digest/record/registry/role/context違い | HashMismatchまたはBinding。元pinの段階別写像を固定 |
| 再読差・全集合extra/missing/duplicate・metadata/path変化 | Changed |
| bytes/entry/depth/work/allocation/call/FD予定量超過 | Limit。decodeが丸めたInvalidRecordを文字列比較で復元しない |
| parser/scan途中の期限/cancel | Deadline/Cancelled。最初のbudget失敗を保持 |
| record期限不足/clock不整合 | 現内部契約のExpiredを維持。実clock丸め方針の承認前は未接続 |
| 観測不足/不完全scan/対応sourceなし、必要なlease/registryなし | Unavailable（取得不明のmetadataは既存MetadataUnavailable）。空集合/成功へ変換しない |

json/ledger/closureには現在Deadline/LimitをInvalidへ丸める箇所があるため、budget-aware coreでは型付き理由を保存する必要がある。時間が残っていてもwork枠超過ならLimitを保持する。
これらは設計上の写像案で、公開exit code/JSONを変更しない。実装時に各producerの理由を合成テストで固定する。

最初の失敗で解析済み結果/部分集合を破棄し、後続scan/M4/roleへ進まない。source/ACL handle/buffer/temporary/予約をRAIIで解放し、最後のcheckpointを通す。
close/freeのために取得枠を再使用せず、解放失敗/終了未確認を成功扱いしない。lease方式は未選定のままで、boolで完了させない。

## 8. 合成試験・実装順案

1. 元budgetを受けるstrict JSON/ledger/registry/closure coreと理由保存を先に設計どおり分離。旧public/offline契約・fixture・424件の既存合成試験の意味を維持する。
2. 本物のschemaに適合する**架空JSON**でactivation→ledger-0.2→registry両role→index全宣言のprivate projectionを試験。未知field、duplicate、末尾データ、旧版混在、path escape、hash/UID/groups/platform/registry/role/期限差を各段階で拒否する。
3. CompleteClosureObservationの内部contractを合成sourceで追加。Node以外の追加/欠落/改変、extra directory child、空dir、case衝突、index自身、same hash別inode、同path別session/round、partial scanの偽装を試す。
4. 元pinsと新verifierをM4前後へ接続。失敗なら後続phaseなし、成功なら全round完了/解放・固定非出力を確認。scan前後record差替えを全3件で試験する。
5. 全境界のcancel/deadline、元time二重加算、新startによる延長、work/allocation/call/2GiB予約、深いpath/zero-byte多数、positive short read/EOF、unwind/drop/最初の理由保持を試験する。
6. 実reader/closure collectorの共有budget/保持FD接続は別段階。合成成功を根拠に実機操作・policy投入・API/permitへ進めない。

## 9. 未確認・承認待ち

| 項目 | 解消までの扱い |
|---|---|
| build registry本番bytes/署名policy・Launcher size/root | 既存停止を維持。合成policyをregistryへ投入しない |
| 実clock起点/丸め・1ms対2ms | FD移譲設計の未確認事項を維持。実clock sourceは停止 |
| closure観測の実producer/同round証明・寿命/lease | 完了値なしでは全集合verifiedとしない。counts/TTLを代用しない |
| 16,384 call/2GiBへ収まる予定量・OS syscall/FD/copy/解放配賦 | 上界を導出できない対象は受付停止。自動拡大なし |
| work/allocation上限・decoderの非checkpoint区間・RSS | §6.1は候補。承認・計上可能性の検証まで運用接続停止 |
| 実FS/ACL/xattr可視性・system/record profile・APFS等 | 空/Absentを仮定しない。実sourceの適合を本設計では確認しない |
| 原子性/ABA/検査後変更・外側hostのhard終了 | 診断を実行authorityへ昇格しない。lease/監督の別承認が必要 |

draft-0.1/0.2ではMDだけを検査した。424件は前工程の記録で、新接続の合格件数ではない。後続JSON coreの検証は§10で別に記録する。

## 10. 共有予算strict JSON coreの先行実装

[JSON core検証記録](E2E_BEST_PRACTICE_R2_OL03_SHARED_JSON_CORE_SYNTHETIC_2026-10-20.md)に、追加23件と全体検証を記録する。
[json/shared.rs](../native/r2-outer/src/json/shared.rs)はcrate内部のstaged coreで、I/O・record trust・registry投入・permitを持たない。旧json.rsのdecode/decode_bounded/decode_policyは変更しない。

- coreはbudgetのcheckpoint/workを借用し、元開始時刻を作り直さない。内部Stateが最初の型付き理由を保持し、serde境界へ固定文言だけを渡す。戻り値はInvalidRecord、Limit(Configuration/Bytes/Depth/Container)、Budget(E)。文字列matchingで理由を復元しない。
- entry/各node/key・挿入・終了確認・型変換の前後をguardする。inputの64KiB chunk、node、key、container挿入、string/key長の64KiB単位、typed変換開始をwork計上する。generic Budgetでは型付きEをそのまま保持する。
- hard入力上限16MiB・深さ16・各container100,000以下をcoreで制限し、profile別の低い上限をLimitsで指定する。policy深さ8/32件等を自動推測しない。超過element/keyはそのsubtreeをdecodeする前に拒否し、空containerはmax_items=0でも受理する。
- UTF-8/文法/duplicate decoded key/trailing dataは拒否。typed decodeはT側のdeny_unknown_fields等を適用する。generic coreが任意Tのunknown fieldを自動拒否するとはしない。
- SharedBudgetのprivate decode_json bridgeを追加した。既存10秒/cancel/first failureを借用し、json_workを全decodeで共有して1,000,000単位を超える前にLimit。local Limitは既存budget Limitへ、InvalidRecordはBindingへラッチするが、最初の戻り値の型付き理由は保持する。
- 1,000,000は§6.1の候補を**停止中の内部合成経路で**用いる暫定capであり、運用承認・最悪CPU時間の保証ではない。payload2GiB/metadata100/名前640KiB/topology16384/pread要求/EINTR枠を消費・resetしない。CPU workと受信bytesを混同しない。
- 長いJSON tokenのserde内部unescape、UTF-8処理、key比較、from_valueの内部処理はまだinterruptibleではない。前後guardで遅延成功/エラーを拒否するがhard timeoutとはしない。Value木/typed objectの管理allocation64MiB/総128MiB候補は**未実装**で、RSS上限も保証しない。

この段階ではrecord revalidate、ledger/registry/closureのbudget-aware core接続は後工程だった。後続の§11でledger/registryとactivationの純粋検証だけを接続した。legacy parserの失敗写像/既存offline契約は維持する。§4のclosure hash-first追加候補は未実装のまま保持する。運用gateは停止を維持する。

## 11. activation/ledger-0.2/registryの共有予算検証

[厳密record検証記録](E2E_BEST_PRACTICE_R2_OL03_STRICT_RECORD_JSON_SYNTHETIC_2026-10-20.md)に追加21件と全体検証を記録する。
[record_validation.rs](../native/r2-outer/src/record_validation.rs)と[SharedBudget bridge](../native/r2-outer/src/signature_boundary/positioned_read/record_json.rs)はprivateな純粋検証経路。実reader/revalidateへの登録、APPROVED_REGISTRYへの投入、index/closure観測は行わない。

- activation/registryは期待raw hashを内部引数で受け、ledgerはactivationが持つledger_sha256へ結合する。3種類とも64KiBのsize guard→checkpoint付きraw hash→JSON decodeの順序。hash違いは不正UTF-8/JSONでもBindingとしてdecode前に停止する。期待hash/contextは比較入力であり、root承認やbuild registryの実証ではない。
- shared JSONはactivation/ledgerが深さ16/container65536、registryが深さ8/container32。既存のschema型/deny_unknown_fieldsを使い、unknown/duplicate/missing/trailing/旧版混在を拒否する。registryのrole/issuer/flags/entitlement検査とledger schema/context検査は既存public parserと意味ロジックを共通化し、別の緩いvalidatorを作らない。
- activationのUID/GID/groups、generation/release/index hash、ledgerのplatform/registry参照/Launcher・Nodeの両roleを検査する。groupsは要素ごとに共有workを消費。新しいregistryへ追従せず、利用者設定/外部registryを取得する口は追加しない。
- 時刻は元started_wall_msと現在now_wall_msを別々の内部context値として受ける。元開始wallで460秒超、現在wallで450秒超。schema::Timeの承認/期限構文を再利用し、現在wallへelapsedを再加算しない。今はpure context値の検査であり、実clock取得/整合/丸め方針を解消したものではない。
- 新しい型付き理由はJson(Rejection<E>)/InvalidRecord/Binding/Expired/Limit/Policy(PolicyFailure)/Budget(E)。serde文字列を照合せず、JSON内部と意味検証境界のDeadline/Cancelled/共有work Limitを保持する。
- SharedBudget::validate_record_jsonは全段階で同じ期限/cancel/workを借用し、最初の有限Failureをラッチ。Json Limit/local LimitはLimit、期限不足はExpired、構造/参照/policy不適合はBindingへ接続し、戻り値の詳細分類は保持する。I/O bytes/予約/metadata/topology枠・開始時刻を変更しない。
- 元のpublic parse/parse_and_bind・legacy decode契約、hash-first ledger順序、失敗型は維持。共通化に伴う公開経路の回帰も全体テストで確認する。coreの1,000,000暫定work cap・非interruptibleなserde/schema/文字列処理・allocation未対応は§10のまま。
- 成功は非Clone/非serializeで固定Debugの`ValidatedRecords(pure_pending_reader_closure_lease_not_execution_authority)`だけ。現RecordBindingへの自動投影や実revalidateとの接続は未実装で、この値からpermitを生成できない。

§11時点の次工程だったindex/closureのbudget-aware pure検証は後続§12で追加した。固定context/registry/pinsの実producer、実record再読への接続、同round全集合証拠は引き続き未対応。純粋JSON/意味検証の成功だけでそれらを埋めない。

## 12. closure index parser・全集合照合の共有予算接続

[closure共有予算検証記録](E2E_BEST_PRACTICE_R2_OL03_SHARED_CLOSURE_JSON_SYNTHETIC_2026-10-20.md)に追加22件と全体検証を記録する。
[closure/shared.rs](../native/r2-outer/src/closure/shared.rs)はpureな宣言検証/全集合照合、[SharedBudget bridge](../native/r2-outer/src/signature_boundary/positioned_read/closure_json.rs)は元budget/first failureへの接続だけを担う。observedは引き続き合成/呼出側の比較データで、実filesystemを列挙しない。

- 新しいshared経路は16MiB/観測100,001件のsize guard、raw index hash（64KiB chunk）、strict JSON decodeの順序を強制する。未認証の不正JSON/UTF-8はClosure(Binding)、pin済み不正JSONはJson(InvalidRecord)で区別する。
- index profileは深さ16/container100,000。既存Index/Entryのdeny_unknown_fieldsを用い、schema/release/generation/path/mode/hash/native suffix/宣言順/case衝突/必要なNodeと固定entry/全親directoryを検査する。
- header・宣言/親directory・全集合の意味検証は既存public checkと共通化。公開check/既存declaredのdecode-first失敗契約は維持する。§4の公開関数自体をhash-firstへ変える候補は未採択で、新しいshared経路だけがhash-firstとなる。
- 全expected/actual mapを1回で比較せず、index自身のentry・集合件数・各path/Entryを個別に照合する。Node以外のfile/directory/indexも追加/欠落/重複・size/hash/type/mode差を拒否し、各要素・parent prefixで元budgetを確認する。意味検証終了後にもguardするが、個々の文字列/BTree操作内部のhard中断は保証しない。
- Declarationは全宣言の整合検証だけで、観測集合を偽造して照合済みと扱わない。Debugは`ClosureDeclaration(pure_not_observation_or_execution_authority)`固定。Comparisonは合成observedとの全集合照合で、`ClosureComparison(pure_pending_observation_producer_lease_not_execution_authority)`固定。どちらも非Clone/非serializeでauthorityへ変換しない。
- RejectionはJson(Rejection<E>)/Closure(ClosureFailure)/Budget(E)。JSON local Limitと意味上の2GiB/件数/size Limit、元Deadline/Cancelled/work LimitをInvalidへ畳まない。意味検査の終了後にもcheckpointを通し、遅延したエラー/成功を確認する。
- SharedBudgetのdeclare_closure_json/check_closure_jsonは同じstart/cancel/json_workを借用。Limitを既存Limit、集合差をChanged、構造/参照不正をBindingへラッチし、戻り値の詳細分類を保持する。宣言→照合や次roundでwork/開始時刻をresetしない。
- 宣言総量（index bytes含む）2GiBは形式検査であり、実read成功bytesの台帳ではない。pure検証ではpayload/予約/metadata/topology/pread/EINTRを変更しない。将来の全scanでのI/O課金/事前予約は別工程。
- 100,000件は形式上限で、暫定1,000,000 work capで全件を扱える保証ではない。Value/typed/index/expected/actualのallocation/RSS、serde内部、sourceの真正性/鮮度/identityを検証したとはしない。

## 13. record再読・最終照合への内部接続

[接続の合成検証記録](E2E_BEST_PRACTICE_R2_OL03_STRICT_RECORD_PIPELINE_SYNTHETIC_2026-10-20.md)と、privateな[strict.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict.rs)を追加した。

- `RecordSource`の通常境界はclock/open/observe/readだけ。旧`revalidate`と旧review wrapperは`cfg(test)`に限定し、以前の非JSON・手動投影の回帰試験専用に残す。新strict経路はsourceの意味投影を呼ばない。
- 元receipt/lineage/pin bytes/hash/metadata/pathを確認し、固定verifierが共有予算activation/ledger-0.2/registry検証を呼ぶ。限定されたborrowed inspection viewからledger/index/root/Node path・digest・policy・世代・release・UID/GID・platform・registry参照・承認/期限を元bindingへ照合する。serde fieldをpublic化せず、公開契約も変えない。
- rootとの包含はslash境界を必要とし、relative pathは既存strict path規則へ合わせる。indexをhash-firstでdeclareし、Nodeのledger hash=index hash、Indexed size/mode0555と元targetを結ぶ。root/size/Nodeだけ合っていることを全closure検査の代替にしない。
- 初回（target解析前）・M4前・M4後の固定3roundで、**3件exact再読→clock→strict検証/全宣言→新しいscan境界→全集合照合→3件exact再読→clock→strict検証/全宣言→clock**を必須化する。scan前後でbytes/metadata/pathが変われば停止し、新しいpin/世代へ追従しない。
- `ClosureObservation`は非Clone/非serializeで、lineage・全RecordBinding・roundを照合する。sourceは検証済み宣言を借りるが、宣言を自動的に観測へコピーする実装は設けない。合成fixtureの観測一覧は別に用意した架空データである。
- scan境界は共有budgetを受け、呼出し全体を1件のI/Oとして課金しない。将来のcollectorは各operation/readを同じ台帳へ課金する必要がある。今回はOS producer、directory names/identityの真正な完了証拠、初回保護読取のproducer、leaseを実装せず、合成観測の一致だけを確認した。
- parser/closure bridgeの型付き失敗を文字列判定せず元sticky Failureへ写像する。Deadline/Cancelled/Limit/Expired、集合・投影差のChanged、構造/registry/policy不適合のBindingを保持し、最初の失敗でM4/次roundへ進まない。leaf parserの詳細型は従来のbridge契約のまま、pipeline外へは既存有限Failureだけを返す。
- 元start/10秒、json_work暫定100万、payload2GiB、A/B予約、topology16384、metadata/name/EINTR等をresetしない。record再読bytesだけ実copy分を課金し、pure解析で受信bytesを水増ししない。全owned source/held target/pinsをdropしてから最終checkpointを通す。旧RecordComparisonの固定Debug/entitlement停止を維持する。

この接続は合成sourceによる内部pipelineで、実filesystem scanの完全性・同inode/ABA・root承認・system profile適合・原子性・hard中断/RSSを証明しない。運用source/事前受付/leaseと本番registryは未接続で、APPROVED_REGISTRY=None・通常v2 Unavailable・gate92・DER/absence停止を維持する。§6.1の追加parseコストを運用前に解決する。

## 14. 同round宣言再利用・work事前受付の設計案（受付は未実装）

[詳細設計draft-0.4](BEST_PRACTICE_BP5_R2_OL03_ROUND_DECLARATION_WORK_DESIGN.md)に、同receipt/同round tokenに結合したimmutable宣言の再利用と残work予約を整理した。indexのJSON decodeだけを全9回から全3回へ減らし、raw hash・全宣言/全集合照合、scan前後のrecord strict検証（計6回）・exact再読/最新clockは維持する。
受付は元budget下のbounded bootstrapと、最初のscan前の残工程予約を分ける。accepted shapeのfile/directory数・全parent prefix・raw長に基づく式と、registry/scan/その他費目の上界を合算し、消費済みworkを二重課金/返却しない。§6.1の概算値を安全な受付上界へ読み替えない。
後続で[round型・decode/意味検査分離の先行合成検証](E2E_BEST_PRACTICE_R2_OL03_ROUND_DECLARATION_SYNTHETIC_2026-10-20.md)を追加した。同receipt/target/context・fresh nonce・budget originへ結合する型と、decodeなしの再認証/意味検査APIだけを先行実装した。その段階では9回decodeのままで、後続§15でpipelineへ接続した。
index固定費・上界は後続§16に記録する。record・collector等の全工程work上界/予約台帳は未実装・未承認。実機・API・token/設定/permitの変更を行ったものではなく、運用gateの停止を維持する。

## 15. 同round宣言のpipeline接続

[再利用pipelineの合成検証](E2E_BEST_PRACTICE_R2_OL03_ROUND_REUSE_PIPELINE_SYNTHETIC_2026-10-20.md)を追加。各roundにwith_roundと一度限りのdecodeを接続し、scan後の全集合照合と最終宣言照合は同じimmutable treeをraw再認証して再検査する。record三者/全projection/Node整合、scan前後のexact再読・clock・元予算は省略しない。
index decodeは3回、record三者strict検証は6回、record再読6cycle・scan3回を合成経路で確認した。観測のlineage/全binding/enumにfresh nonce一致も加え、正しいenumでも前roundの観測tokenを拒否する。失敗後のM4/次round停止・全resource解放と既存gateを維持する。
4,006 entryの架空データで再利用接続時（model収集前）の課金値は471,312 workだった。旧9parse相当のindex-only手順が100万capでLimitとなることも比較したが、これは実source/実閉包・hard時間・RSSや全費目を証明する試験ではない。後続§16でindex modelを追加し、全工程の費目上界・事前受付・実source/leaseは引き続き未対応。

## 16. index work_model_id・shape・課金work上界

[index model合成検証記録](E2E_BEST_PRACTICE_R2_OL03_INDEX_WORK_MODEL_SYNTHETIC_2026-10-20.md)を追加した。strict decode/宣言検証後にsealed profileを同roundへ結合し、B/F/D/Pと固定ID`bp5-r2-index-work-0.1`、index-onlyの1round/3round上界を計算する。shape収集・計算も元budgetへ課金し、model不一致はUnavailable、shape/cap/overflowはtyped理由を保持してLimitへ接続する。
式はJ_index=C+20+26F+17D、収集の可変費N+P、その他可変費6C+9N+3P+100001、固定枠128。固定実消費は既存32＋収集固定3＋計算8＋reuse model照合2＝45で、128を消費workにしない。観測N+1 guard未対応のため現global上限100,001を使い、過小なM_maxを仮定しない。
scope付きsummary/cap helperは分析/量比較だけで、spent控除・残工程予約や全体受付には接続しない。R/scan/その他・管理allocation/FD/clock/leaseの証明は未完了。課金work上界はhard CPU時間/RSSや未課金のpin-memory hash等を覆う保証ではない。
同じ4,006 entry fixtureの現在の実消費は495,381 workで、以前の471,312との差24,069は各roundのN+P+3収集＋8計算＋2モデル照合を加えた分。index decode3回・record検証6回・前後再読・各停止gateは維持する。
