# BP-5 R-2 OL-03：sealed scan shape/profile・純粋計算器の詳細設計

Version: draft-0.1 / Date: 2026-10-20 / Status: 設計のみ。以下の型・課金ブロック・計算器・one-shot状態は未実装／未計数検証。

## 1. 目的・停止条件

[現行collector費目設計draft-0.3](BEST_PRACTICE_BP5_R2_OL03_COLLECTOR_WORK_REDESIGN.md)と[費目別合成検証](E2E_BEST_PRACTICE_R2_OL03_COLLECTOR_WORK_ACCOUNTING_SYNTHETIC_2026-10-20.md)の次工程として、受理済み宣言から運用内部で統計を導出し、その由来を保持したまま上界を計算する契約を定める。参照実装は `81c2653`。test oracleを運用profileへそのまま昇格させない。

全体受付無効、telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持する。本書作成では実装・OS接続・実機操作・トークン発行・設定変更・本番policy投入・permit発行・Pushを行わない。数値計算成功はscan開始許可・quota承認・実署名成功ではない。

workは元SharedBudgetの課金量であり、CPU時間・RSS・allocator/OS処理時間の上界ではない。本書の収集費・算術費は**今後実装する固定スケジュール案**で、現行の1,902 workへ既に含まれる実費ではない。

## 2. 選択：count-onlyの一時集計、scalar-onlyのsealed出力

採用案は、通常宣言の各slotに対応する `Vec<u64>` のcountだけを一時的に持つ方式。rootのcountは別scalarとする。各entryの親を通常宣言sliceのbinary searchで解決し、親Directoryのslotのcountを増やす。virtual indexも同じ処理へ一度だけ含める。

全childのslot一覧、stable scatter、start/cursor配列は作らず、collectorのChildGroupsを複製しない。最終passでJ/c_max等を集約したらcount配列を解放し、profileへはscalar統計と不変の由来だけを残す。count配列はcollectorのgroups構築時には存在しないため、両者の配列を同時に保持する設計を既定にしない。

ただし**親探索とcount更新自体は二度行われる**。profileの収集費はO、現行collectorのgroupsはS.groupsへそれぞれ数える。profileを根拠に現行groupsの検査を省略・上界から控除しない。将来groupsの部分再利用を行う場合は、型・寿命・費目とkernelモデルの再設計を別途必要とする。

代替のBTreeMap/HashMap、呼出し元histogram、test oracleの無課金setup、groupsの実測B/V/Mを受付根拠とする経路は採用しない。宣言の追加JSON decode・index再parseも不要とする。

## 3. 非公開型・由来の契約

以下は名称を含め設計案であり、公開API/serde schemaではない。

| 型 | 保持するもの | 禁止事項 |
|---|---|---|
| `ScanShapeProfile` | 同ScanInputsへのborrow、同RoundScopeへのborrow、receipt/target/contextのidentity、round token、budget originのRc、元started、retry残r、private scalar群、model識別子 | public constructor、Clone/Copy、Serialize/Deserialize、mutable統計getter、呼出し元数値からの生成 |
| `ScanWorkEstimate` | **所有する**profile、privateな費目別上界/合計/同shape予測、calculator/kernel model識別子 | profileから複数estimate生成、scalar summaryからの復元、予約/permitへの暗黙変換 |
| `ScanWorkSummary` | 必要なら検査用の数値・固定model名だけ | この値をprofile/estimate/phase完了の入力として受け付けない |

profileはbuilderからのみ返す。計算器はprofileを**値で消費**し、estimateがprofileを所有する。失敗時はdropし、同じprofileで再計算する口を設けない。将来のscan bridgeもestimateを値で消費する案とし、借用summaryによる二重scanを許さない。ただし本工程ではbridgeやscanを接続しない。

Debugは固定のopaque labelとし、内部address・registry本文・receiptのraw bytes・path/hashを出力しない。検査用summaryは数量と固定model名だけで、元のidentityを復元できる入力口にしない。

ScanInputsに将来追加するprivateなprofile試行claimは、同Inputsで一度だけ。構築開始後の失敗でもclaimを戻さない。現行の `claim_inputs` はScanInputs構築用であり、この用途へ転用・リセットしない。one-shot失敗後は同roundで別Inputsを作り直して迂回できないことも試験する。

### 3.1 identityの固定

- 同じScanInputs objectとそのdeclaration、receipt、target、contextをborrowする。内容・hash・generationが一致しても別objectは拒否する。virtual indexは元Inputsのindexそのものから作る。
- round enumに加え、同RoundScope objectと同tokenへの参照を結ぶ。別round、同round名の別token、同bytesの別receiptへ流用しない。
- budgetそのものを長期immutable borrowして後続の課金を妨げず、private `inspection_origin` のRc同一性と元startedを保存する。別予算へ移し替えない。新しいstart/deadline/EINTR残を作らない。
- root device・runtime root・index path/raw length/hashは同receipt/Inputsの不変値へ由来を固定する。利用者にpath・h・index bytes・group数等を申告させない。
- Profile→Estimate→将来利用入口まで同Readyに結合する。Readyのphase遷移をborrowで阻止できる部分は寿命で表し、利用時のphase guardも省略しない。失敗時にReadyへ戻すAPIは設けない。

既存Inputs.guardの3 workはensure_scope・Ready確認・declaration同一性。借用だけでsourceの真実性、OSの不変性やrecordの期限を証明したとしない。既存のrecord再読・clock_check・AfterScan/FinalIndexは引き続き必要である。

## 4. 導出するscalarと整合条件

親設計のN/E/D/F/T/h/K/P/k_v/c_d/c_v/c_max/L/C/b_v/C_v/rを引き継ぐ。profileの出力は以下に絞る。

- N、E、D、F、T、h、K、P、k_v、c_0、c_v、c_max、J、L、C、b_v、C_v、r。
- `M=E−c_0` は親を持つentry数。M≤Pを検査する。rootを含む直接子数の総和がEであること、file slotのcountが0であることを検査する。
- Jはrootと全Directoryについて `Σ c_d×ell(c_d)` を集計した値。全c_d配列をprofileに残さなくても、同一宣言由来の集計・整合検査により受け付ける。ell(n)はinteger bit長、ell(0)=0。
- E=N+1、E=D+F、T=D+1≤E、P=K−E、1≤k_i/k_v/h≤64、1≤c_v≤c_max≤E、0≤c_0≤E、Σc_d=E。virtual indexはFile一件としてF/C/L/K等へ一度だけ加算する。
- N≤100,000、各通常file≤512MiB、index rawは1〜16MiB、indexのsize/hash/mode/pathは同Inputsのprojectionと一致すること。Lはindex込みで元共有payload上限2GiB以下。これだけで3round/A・B/record再読のbytes受付を満たすとはしない。
- chunkはfileごとに `ceil(size/65536)` を加える。空fileは0 chunkでもEOFを省略しない。全file bytesの合計からchunkを逆算しない。ceilはchecked quotient＋remainderで計算し、`size+65535` の無検査加算をしない。

既存strict宣言が検査済みでも、新profileに必要な512MiB制約・算術/slot整合はbuilderで確認する。scope/budget由来のない同じscalar群は受け付けない。

## 5. 統計収集スケジュールと課金

以下の1 workは、明示した**有限の処理ブロック**1回への課金案である。複数のchecked演算を含むが、各ブロックは固定個数（最大32個）のscalar演算/検査に限る。反復は別途iterationごとに課金する。machine instruction数の意味ではない。実装で追加work helperを呼ぶなら、この表と式を改訂・再計数する。

| 順序 | 処理・所有O.profile | work |
|---|---|---:|
| 1 | 固定profile modelの検査1、既存Inputs.layoutのguard/projection4、one-shot claim1、origin/started/retry snapshot1 | 7 |
| 2 | N上限/checked byte数/割当guard後にcount配列をtry_reserve_exact。失敗はLimit | 1 |
| 3 | 通常宣言slotのcountを0で初期化 | N |
| 4a | entry開始の局所検査、type分類、depth集約、byte/chunk集約、親count更新の5固定ブロック。Directoryのbyte/chunkブロックもguardとして課金 | 5E |
| 4b | 各相対componentの走査。64を超えた時点で拒否し、隠れた無課金countをしない | K |
| 4c | root以外の親のbinary search。各比較1、見つけた親のDirectory/slot確認1 | B＋M |
| 5 | root countからJ/Σcount/c_maxを初期化するfold | 1 |
| 6 | 通常宣言slotを順に再訪し、Fileのcount=0を検査。Directoryでは別のfold1でJ/Σcount/c_maxを更新。空Directoryもfoldする | N＋D |
| 7 | 保存したvirtual-parent slotから最終c_vを取り出す。rootならc_0 | 1 |
| 8 | 全整合条件・binding/retry不変・終端guardを確認してscalar profileを返す | 1 |

親検索は通常宣言のimmutable slice（indexを含めない）を使う。入れ子親の1探索あたり比較数≤ell(N)。entryの親を一度だけ解決し、path prefix全部を探索しない。深さ走査で得たk_i/K/Pと、parent slotの探索を混同しない。親がFile/欠落ならBindingで停止する。

path/digestの書式は同じimmutableなstrict宣言に由来する。追加の文字列parse/全文字検査やJSON再読を固定scalarブロックへ隠さない。本書で必要なcomponent走査は4bで別課金し、その他の追加走査が必要なら収集スケジュール自体を改訂する。

```text
W_profile_success = 11 + 2N + 5E + K + B + M + D
U_profile         = 11 + 2N + 5E + K + M×(ell(N)+1) + D
M = E−c_0
```

これは**実装予定の成功スケジュールの式**で、現行builderの実測値ではない。拒否prefixで追加のiterationがないかは実装時に別検証する。受理済み宣言にない巨大/不正shapeへ、この成功式を無条件に適用しない。bootstrap段階でworkが尽きればprofileを返さず、そのまま停止する。

count配列はN要素のu64、通常宣言とvirtual entryはborrowし、pathを複製しない。layoutの一時component配列/文字列もOのallocationとして扱う。try_reserve/checked byte数はRSS上界やallocator時間の証明ではない。失敗時の配列/borrow/Rc解放はRAIIで行い、Dropをwork不足・取消で省略しない。OS handleは取得しない。

## 6. 純粋計算器と算術費

候補IDはprofile `bp5-r2-scan-profile-0.1`、calculator `bp5-r2-collector-work-0.1`。固定内部識別子の案であり、実装への登録・APPROVED_REGISTRY投入はまだ行わない。旧 `bp5-r2-scan-work-0.1` やindex/record modelを代用しない。係数表・model名の任意入力を許さない。

計算器はsealed profileを消費し、fixture/test oracleのu128算術をコピーせず、各中間値をchecked u64で扱う。飽和演算・wrapping・float log・失敗時の0置換は禁止。ceil/ell helperは固定幅scalarだけを受け、配列走査・I/O・JSON decode・再統計を行わない。

### 6.1 Profile.requireと追加利用guard

Profile.requireは、既存Inputs.guard3＋由来/固定model/immutable統計の同一性確認1＋保存したretry残と現budget残の一致確認1で**5 work**の案とする。各workと終端checkpointで元の最初の失敗を保持する。別receipt/target/context/declaration/Inputs/scope/token/budget origin/started、Ready外を拒否する。

retry残が減っていればChanged。古い上界が保守的に見えても自動的にrを差し替えて再計算しない。増えていれば同じく拒否する。内部で新budgetを作り「同じ残数」に合わせることも禁止する。builder完了からcalc/利用入口まで元budgetへ別の作業を挿入しても、spentを巻き戻さず、残workの受付成功とは扱わない。

将来estimateを利用するときは、上記5＋estimate/profile/modelの結合確認1＋一度だけの移譲確認1の**7 work**をO.useへ別計上する案。橋渡しは未実装なので、このguardが現行collectに存在するとは記さない。内部estimateの消費は実行permitの発行ではない。

### 6.2 固定15算術ブロック

各行は前後checkpointを伴う1 work＋最大32個の固定scalar演算/検査。row内のchecked helperは追加workを隠して呼ばない。失敗時はその行までの実消費だけを残す。

| row | 固定計算・検査 |
|---|---|
| 1 | calculator/kernel/profileの固定model整合、数量の定義域/関係式の再確認 |
| 2 | M、ell(N)、ell(c_v)、ell(c_max)、同roundから残round数n（Initial=3/BeforeM4=2/AfterM4=1） |
| 3 | `U_groups = 8+4E+4T+min(P,M)×ell(N)+ell(c_v)+c_v` |
| 4 | `U_route = h+2+E×(h+3)+K+k_v+P×ell(N)` |
| 5 | `W=2E+3`、`A=W×(h+1)+2K` |
| 6 | `U_walk=W+23A` |
| 7 | `U_enum=32E+58T+J` |
| 8 | `U_file=56F+5C` |
| 9 | **`U_control=37+4E+D`**。最後の保持root照合21を再び落とさない |
| 10 | `U_seal=11+2C_v+4E+P`。AfterScanとは別費 |
| 11 | `U_tail=16+ell(c_max)+3×(r+1)` |
| 12 | 7費目＋tailのchecked総和 `U_S` |
| 13 | `U_base=U_S−3×(r+1)`。定義済みretry項以外を減算しない |
| 14 | 同shapeの場合の残scan予測 `n×U_base+3r+3`、profile収集費の上界U_profile |
| 15 | 全scalarの整合・binding/r不変・終端guard、完成したestimateへの移譲 |

```text
W_calculate_success = Profile.require(5) + 15 = 20
U_calculate_prefix  = 20
```

20も実装予定の課金契約で、独立計数が未実施。各row内の32演算上限やguard数が実装時に超えるなら、隠れた無課金処理を置かず表/式/試験を更新する。再帰・可変長のsum(Vec)・同じentry全件走査をfixed rowへ混ぜない。

既存の基本fixture（N=4/E=5/D=2/K=8/c_0=3/M=2/ell(N)=3）ではU_profile=62、計算20、将来利用guard7でOの追加部分は89 workとなる案。これは未実装の課金案の算術例で、実測ではない。kernel候補2017へ加えると2106だが、ScanInputs構築・I/R/その他Oを含む全体額ではなく、受付可能性は判定しない。

estimateは純粋な上界と同shapeの予測を持つだけ。残work/payload/operation/cleanup枠との比較や予約を行わず、「fits」「admitted」を返さない。上界が100万を超えても、純粋算術結果を検査用の過大見積りとして保持できる案とする。算術overflowはLimitで停止する。上限超過を実行可能へ変換する口は設けない。

## 7. 費目所有・3round予測

| 対象 | 所有 | 二重計上/先取りの禁止 |
|---|---|---|
| 既存ScanInputs構築 | O.bind | 現行の`7+A_index`を維持。本書のprofileへ含めない |
| profileのlayout取得・統計収集 | O.profile | kernel内のlayout/groupsは依然別の実行。控除しない |
| 20 workの算術とそのguard | O.calculate | Sの候補式の固定余裕へ吸収しない |
| 将来利用guard7 | O.use | 通常strict bridgeの他費用が0になったとはしない |
| 現行collect核 | S | 既存費目式とseal/AfterScanの分離を維持 |

3roundともfreshなInputs/profile/estimateが必要。同じprofileやcount配列を次roundへ持ち越さず、各record/indexの前後厳密検証も維持する。n×U_base等は同じ不変宣言・shapeを将来も厳密再確認できる場合の**予測値**で、将来roundのbindingを発行した値ではない。

同shapeで全3roundを行う場合のO部分の候補は `3U_profile + 3×20 + 3×7 + ΣO.bind`。残EINTRはsession全体で共有し、各profileへ8を新規付与しない。初回profile/算術が終了したことは、spentを返却する理由にならない。将来の残予定量から除くのは完了済み固定phaseの上界だけとし、実測spentを恣意的に引かない。

I/R/target/phase/bridgeのその他費用と独立resource上界は未完了。上記を足しても全体受付が完成したとしない。実閉包規模で現行walkが支配し元work上限を超えるという親設計の見通しも変わらない。

### 7.1 実閉包規模でのO.profile試算（2026-10-21、レビュー）

§5の `U_profile` へ、親設計[§7.1](BEST_PRACTICE_BP5_R2_OL03_COLLECTOR_WORK_REDESIGN.md#71-実閉包規模の机上試算2026-10-20レビュー)と同じ規模のshapeを代入した机上計算である（実装・実測ではない）。前提：N=5,500、E=5,501、K=27,501、D=1,000、ell(N)=13、c_0=1〜100（仮定）。

| 項目 | 値 |
|---|---|
| U_profile（1round） | 約142,600〜144,000 |
| 3round分のO.profile | 約427,900〜432,100 |
| 3round分のO（profile＋calculate 3×20＋use 3×7） | 約428,000〜432,100 |

- O.profileだけで3roundの合計が元work上限100万の約43%に達する。S（現行collector核）・I・R・その他Oを加える前の値である。
- うち親のbinary search `M×(ell(N)+1)` は約7.6万〜7.7万/roundで、collectorのS.groupsの実測（期待子準備の記録で77,890）とほぼ同じ探索を**もう一度**行う分に当たる。§2のとおり意図的な二重実行であり設計の誤りではないが、規模は小さくない。
- 現時点の受付不能という結論はU_walkが支配するため変わらない。ただし将来walkの費用を下げた後には、この重複が主要な費目になり得る。groups結果の部分再利用（型・寿命・費目・kernelモデルの再設計を伴う）を検討する際の判断材料としてこの数値を残す。再利用を採用するまでは、profileとS.groupsの双方を控除せずに数える。

## 8. 失敗時停止とリソース解放

| 条件 | 予定する分類/扱い |
|---|---|
| 既存sticky failure、取消、共有期限 | 元の理由を優先。後続の統計/算術/scan/roundへ進まず、途中値を返さない |
| 未知/混在model、未対応kernel | Unavailable。旧モデルやtest oracleへfallbackしない |
| 別Inputs/receipt/target/context/declaration/scope/token/budget、Ready外 | Binding。値の同一性やhashで救済しない |
| 保存したretry残の変化、既存不変値との矛盾 | Changed。snapshotを新値へ更新しない |
| 上限・checked算術/byte換算overflow・try_reserve失敗 | Limit。0/飽和值/旧estimateを返さない |
| 親欠落/File親/slot不整合・未検証の由来 | Binding。部分profileを返さない |

全体は元SharedBudgetへ理由をラッチする。後続の分類/Dropが先行理由を上書きしない。profile/estimateはOS handleを持たず、一時count/layout allocation・borrow/RcをDropで解放する。one-shot claim、実消費work、payload等を返却/初期化しない。allocatorのhard停止やOS cleanup完了を証明するものではない。

元10秒のstart/originを保持して各loop/算術row前後でcheckpointを行う。checked演算が成功しても、最後の取消/期限・binding guardが失敗した値は公開しない。recordやmanifestのwall-clock期限を本書のmonotonic checkpointだけで検証したことにはしない。

## 9. 実装時の受入試験（未実施）

1. 同Readyからのtracer：profile→calcが完了し、collector oracleのscalar/費目と一致。ただし製品collectorへ接続しない。
2. 単独費：収集の各ブロック/loopと算術15行をobserverへ対応付け、費目総和=元budget delta。file/Directory・root/nested・空directory・nested/先頭/末尾indexで `W_profile_success` と照合。
3. shape：単なる呼出し元scalarから生成不能、親別count総和、J、K/P、fileごとのceil、h/k=1/64、N上限、512MiB制約/16MiB index、type/slot/parent不正。旧index制約とscan制約の差を維持。
4. 算術：各checked演算のoverflow・underflow・ell(0)/2の冪前後。生の巨大値試験用入口は`cfg(test)`内に限定し、運用constructorを追加しない。
5. identity：同bytesの別allocation/Inputs/receipt/context、同round名の別token、別budget、同originを装った別start、別model、retry増減を拒否。
6. one-shot：同Inputsの再構築、失敗後の再試行、profileの複製/serde生成、estimateを2回移譲する経路がないこと。borrowのcompile-fail試験とruntime guardの双方を行う。
7. 中断：全不足work prefix、allocation直前/直後、各parent比較、最終fold/publish、calc全15rowとpost-charge guardに取消/期限を注入。最初の失敗保持・返金なし・部分値なし・解放を確認。
8. 禁止効果：test sourceでOS/ScanOps/read/外部通信が一度も呼ばれず、bytes予約・operation quota・EINTR残・deadlineが増減/再生成されないこと（workのみ増える）。
9. 感度：virtual index/最後のroot費/sealを除外、root子数を未課金・未検証入力にする、別round再利用、収集費をgroupsから二重控除する変異を検出する。

## 10. 実装順・未確定事項

最初はprivate scalar型と収集の固定ブロック/親count passを合成試験で実装する。次にprofile消費型の15-row計算器、binding/retry guardと失敗prefixの検証へ進む。既存test oracleを比較対象に残し、同じ実装helperだけで期待値を作らない。

課金ブロックの係数・最大32演算の独立確認、Rustの具体的なlifetime/one-shot field配置、allocationの独立上界、submodel ID確定は実装前後のレビュー対象。OS権限やpolicyは本書で承認しない。3round resource台帳・全体work予約・通常strict bridge・hard停止はさらに後工程とし、ここまで全体受付を無効のまま維持する。

## 11. 今回の文書確認

新規設計書と親3文書について、相対参照67件の参照先ファイル存在、code fence対応・末尾改行、`git diff --check`を確認した。基本fixtureへの式の代入はU_profile=62、O.calculate=20、O.use=7、計89となることを確認した。これは算術確認のみで、予定スケジュールの実装・計数試験ではない。

ソース変更はなく、Rustビルド・テストは再実行していない。旧契約・固定評価セット・現在の停止状態は変更しない。
