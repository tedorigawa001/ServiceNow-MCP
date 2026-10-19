# BP-5 R-2 OL-03：厳密record parser・全closure集合の再検証接続

Version: draft-0.2 / Date: 2026-10-20 / Status: 詳細設計案。接続実装・運用承認は未実施。

## 1. 範囲と停止境界

[FD移譲設計§15](BEST_PRACTICE_BP5_R2_OL03_SECURE_FD_TRANSFER_DESIGN.md)の合成`RecordSource::revalidate`を、既存の厳密parserと**全closure集合**の検証へ置き換える設計。
前工程の[424件の合成検証](E2E_BEST_PRACTICE_R2_OL03_RECORD_FINAL_SYNTHETIC_2026-10-20.md)は、架空の非JSON bytesと手動投影の契約試験であり、本書の接続が動く証拠ではない。

今回の成果物はMDだけ。telemetry調査は保留。実装、実機/PDI操作、API実接続、token発行、設定変更、実署名、本番policy投入、permit発行は対象外。
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

以下はprivate型/関数の設計名で、まだ実装しない。

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

これは**今後の推奨順序**。現records.rsにはfull scan/scan後追加record再読はない。revalidateの1呼出し内へ全scanを隠して実装済みに見せない。
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

本設計で実装/ビルド/実機テストは行わない。文書のlocal links/code fence/行末空白・diffと、変更がMDだけであることを確認する。424件は前工程の記録で、新接続の合格件数ではない。
